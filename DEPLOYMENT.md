# Deploying Pager

Pager is designed to run on a single Ubuntu box behind Caddy. This guide covers what you need, how to install, and how to keep it healthy.

## What you need

- **Ubuntu 22.04 or 24.04** — the installer targets these. Other Linux distros should work with Docker Engine + compose plugin already installed, but the one-liner won't run.
- **A domain name** pointed at the box's public IP (A/AAAA record). Caddy needs this to obtain TLS certificates from Let's Encrypt.
- **Ports 80 and 443 open** to the public internet. 80 is required for ACME HTTP-01 challenge; 443 is the actual traffic.
- **An email address** for Let's Encrypt notifications (expiry warnings, key changes).

Everything else — Docker, the compose plugin, the repo itself — the installer handles.

## Hardware recommendations

Pager isn't picky. Every workload below assumes the whole stack (Mongo + Go API + Next.js + Caddy) on one host.

| Workload | vCPU | RAM | Disk | Runs happily on |
|---|---|---|---|---|
| Personal / hobby (a few hundred pageviews / day) | 1 | 1 GB | 10 GB | Cheapest tier VPS, Raspberry Pi 4, old laptop |
| Small marketing / SaaS (thousands / day, 1–3 sites) | 1 | 2 GB | 20 GB | $6–10 / month VPS |
| Team / agency (up to ~100k pageviews / day, several sites) | 2 | 4 GB | 40 GB SSD | $20–30 / month VPS |
| Higher volume | 4+ | 8+ GB | SSD | Dedicated box; at this scale, plan for retention/pruning |

### Storage sizing

Every event document is roughly 500 bytes uncompressed. MongoDB's default WiredTiger engine with snappy compression typically cuts that in half on disk.

- **100k pageviews / month ≈ 30 MB compressed / month** (~360 MB / year)
- **1M pageviews / month ≈ 300 MB compressed / month** (~3.6 GB / year)
- **10M pageviews / month ≈ 3 GB compressed / month** (~36 GB / year)

Pager has **no data retention job in v1** — events accumulate forever unless you prune. See [Retention](#retention--pruning) below.

### CPU / RAM notes

- MongoDB keeps its working set in memory; giving it more RAM makes aggregations faster but isn't strictly required.
- The Go API is small (~30 MB resident), spikes briefly during aggregation queries.
- Next.js in standalone mode uses ~120 MB resident.
- Caddy sits under 50 MB.
- Peak load is at **ingest** (many small writes) and when the admin UI runs a report (one aggregation pipeline per open page). Neither is CPU-intensive for typical volumes.

## Install

From a fresh Ubuntu box, as root:

```bash
curl -fsSL https://raw.githubusercontent.com/vikar-ltd/pager/main/scripts/install.sh \
  | sudo bash -s -- --domain pager.example.com --email you@example.com
```

Or, if you've already cloned the repo:

```bash
sudo ./scripts/install.sh --domain pager.example.com --email you@example.com
```

The installer:

1. Installs Docker Engine + the compose plugin from Docker's official apt repo.
2. Clones the repo into `/opt/pager` (customisable with `--dir`).
3. Generates `.env` with a random `ROOT_PASSWORD` (32 base62 chars) and `SESSION_PEPPER`.
4. Runs `docker compose up -d --build`.
5. Waits for the API health check, then prints the URL and credentials.

It's **idempotent** — re-running preserves the existing `.env` and just recycles the containers.

### Flags

| Flag | Default | Purpose |
|---|---|---|
| `--domain` | *(prompted)* | Public hostname for the admin UI |
| `--email` | *(prompted)* | Let's Encrypt email |
| `--username` | `root` | Username of the seeded root user |
| `--dir` | `/opt/pager` | Where to clone the repo |
| `--repo` | github.com/vikar-ltd/pager | Git remote (in case you fork) |
| `--yes` | off | Non-interactive; fail if `--domain`/`--email` missing |

## Configuration (`.env`)

| Variable | Required | Notes |
|---|---|---|
| `PAGER_DOMAIN` | ✓ | Public hostname; passed to Caddy for TLS |
| `ACME_EMAIL` | ✓ | Let's Encrypt registration email |
| `ROOT_USERNAME` | | Seeded on first boot only. Default `root` |
| `ROOT_PASSWORD` | ✓ | Seeded on first boot only |
| `MONGO_URI` | ✓ | Defaults to `mongodb://mongo:27017` in-compose |
| `MONGO_DB` | | Defaults to `pager` |
| `SESSION_PEPPER` | ✓ | Random 48+ chars; rotating invalidates every admin session |

`ROOT_USERNAME` and `ROOT_PASSWORD` are **only used on first boot** to seed the initial root user. After that all user management goes through the admin UI. If every root user is ever deleted, the seed re-creates one with these values on the next start — that's your break-glass recovery path. `ADMIN_USERNAME` / `ADMIN_PASSWORD` are still accepted as fallbacks for anyone upgrading from earlier builds.

## TLS

Caddy handles TLS automatically:

- Fetches a certificate from Let's Encrypt on first boot (needs port 80 reachable).
- Renews it well before expiry, no cron needed.
- Uses HTTP/2 and HTTP/3 (QUIC) out of the box.

Cert data lives in a named docker volume (`caddy-data`). Don't delete it unless you want to force re-issuance.

If your certificates aren't provisioning, check:

```bash
docker compose logs caddy
```

The two most common causes are DNS not yet propagated and port 80 being blocked.

## Upgrading

```bash
cd /opt/pager
git pull
docker compose pull                 # for any images that come from Docker Hub
docker compose up -d --build
```

Since Pager builds `api` and `web` from source, the `--build` flag rebuilds them from your updated checkout. No downtime beyond the recreated containers (a few seconds).

### One-liner with Taskfile

`scripts/install.sh` also installs [go-task](https://taskfile.dev), so from any fresh install you can use the recipes in `Taskfile.yml` immediately:

```bash
cd /opt/pager && sudo task update
```

Run `task -l` from the repo to see every available recipe (`up`, `down`, `status`, `logs:api`, `logs:caddy`, `mongo`, `backup`, `restore FILE=…`, `reset`, `restart SVC=…`, and the dev-only counterparts). All of them are thin wrappers around the corresponding `docker compose …` commands — nothing magic, just discoverable.

### Unattended daily auto-update

Pass `--auto-update` to the installer to opt into a daily cron that runs `task update` at **04:00 UTC**:

```bash
sudo ./scripts/install.sh --domain pager.example.com --email you@example.com --auto-update
```

That writes `/etc/cron.d/pager` (with `flock` guarding against overlapping runs) and `/etc/logrotate.d/pager` (weekly rotation, four weeks retained). Logs go to `/var/log/pager-update.log`.

To change the schedule, edit `/etc/cron.d/pager` directly — the cron time (`0 4 * * *`) is a normal cron expression.

To disable later, either delete `/etc/cron.d/pager` by hand or rerun the installer with `--no-auto-update`.

## Backup & restore

### Backup

Everything Pager knows is in Mongo. To take a compressed snapshot:

```bash
docker compose exec -T mongo mongodump --archive --gzip --db pager > pager-$(date +%F).archive.gz
```

Move that file off the box (rsync, S3, whatever).

### Restore

On a fresh install (or after a rebuild):

```bash
cat pager-YYYY-MM-DD.archive.gz | docker compose exec -T mongo mongorestore --archive --gzip --drop
```

`--drop` clears existing collections before restoring — remove that flag if you want to merge.

### Automated backups

Simplest: a nightly cron on the host.

```cron
0 3 * * * cd /opt/pager && docker compose exec -T mongo mongodump --archive --gzip --db pager > /var/backups/pager-$(date +\%F).archive.gz
```

Rotate old files with `find /var/backups/ -name 'pager-*.archive.gz' -mtime +30 -delete` in the same crontab if you want a 30-day window.

## Retention / pruning

Pager doesn't drop old events automatically. When the `events` collection outgrows what you want to keep:

```bash
# Delete everything older than 180 days
docker compose exec -T mongo mongosh pager --eval '
  db.events.deleteMany({ ts: { $lt: new Date(Date.now() - 180*24*60*60*1000) } });
'
```

Or add a TTL index for a hands-off approach:

```bash
docker compose exec -T mongo mongosh pager --eval '
  db.events.createIndex({ ts: 1 }, { expireAfterSeconds: 180 * 24 * 60 * 60 });
'
```

The `visitors` and `tracking_sessions` collections are much smaller (one row per person / per session) and rarely need pruning.

## Multi-subdomain platforms

If you're tracking a platform that spans multiple subdomains (`www.example.com` + `app.example.com` + `demo.example.com`), add a `data-cookie-domain` attribute to the snippet:

```html
<script
  src="https://YOUR-PAGER/pub/p.js"
  data-site-id="YOUR_SITE_ID"
  data-cookie-domain=".example.com"
></script>
```

That leading dot matters — it scopes the `_pgr_v` and `_pgr_s` cookies to *every* subdomain of `example.com`, so a person crossing from `www.` to `app.` is recognized as the same visitor with a continuous session.

Without `data-cookie-domain`, cookies scope to the exact host and cross-subdomain navigation starts a fresh visitor + session on every hop.

Two constraints worth knowing:

- Use the eTLD+1 (the "registrable domain"). `.example.com` works; `.com` doesn't — browsers reject Public Suffix List entries. `.example.co.uk` works; `.co.uk` doesn't.
- All subdomains must be on the same eTLD+1. This won't help you unify `example.com` and `example.io`; those are separate origins to the browser.

## Monitoring

Everything logs to stdout in JSON. Point your log shipper of choice at the container logs:

```bash
docker compose logs -f api        # tail API logs
docker compose logs -f caddy      # TLS + access
```

For basic health, the API container has a docker-native healthcheck that runs every 10s (`/pager -healthcheck`). `docker compose ps` will show `(healthy)` once it's serving.

## Firewall

Only ports **80** and **443** need to be reachable from the internet. Everything else (Mongo, the API, the Next.js server) is internal to the compose network and never exposed to the host, let alone the internet.

If you're running `ufw`:

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow OpenSSH   # or whatever port your SSH is on
sudo ufw enable
```

## Ops cheat sheet

Run these from `/opt/pager`:

```bash
docker compose ps                                    # container status
docker compose logs -f api                           # tail API logs
docker compose exec api /pager -healthcheck && echo OK
docker compose exec mongo mongosh pager              # open a shell
docker compose restart api                           # bounce API only
docker compose down                                  # stop everything (data preserved in volumes)
docker compose up -d --build                         # rebuild + start
docker compose down -v                               # ⚠ destroys volumes — full data wipe
```

If you've installed `task`, the same recipes are `task status`, `task logs:api`, `task mongo`, `task restart`, `task down`, `task update`. `task -l` shows the full list.

## Data model at a glance

If you ever need to poke around in Mongo directly, the collections are:

- `users` — admin users (`{username, passwordHash, role, ...}`)
- `admin_sessions` — cookie-token sessions for the admin UI
- `properties` — one row per tracked site (`{name, domain, siteId, ...}`)
- `visitors` — one row per person (`_id` is the `_pgr_v` cookie value)
- `tracking_sessions` — one row per visit window (`_id` is the `_pgr_s` cookie value)
- `events` — pageviews and custom events
- `goals` — URL/event conversion criteria per property

All indexes are ensured automatically at startup — see `api/internal/mongox/mongox.go`.
