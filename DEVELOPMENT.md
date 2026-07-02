# Developing on Pager

Everything you need to work on Pager locally. If you just want to run it in production, see [DEPLOYMENT.md](DEPLOYMENT.md) instead.

## Prerequisites

- **Docker + Compose plugin** — this is how the stack runs end to end. On macOS use Docker Desktop, Colima, or OrbStack; on Linux the official Docker Engine.
- **Go 1.25+** — only needed if you want to build/test the API outside of Docker.
- **Node 20+** and **npm** — same story for the Next.js admin and the E2E verifier.
- **mongosh** *(optional)* — handy for poking at data directly. Not required; you can always `docker compose exec mongo mongosh` instead.

## Quick start

```bash
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

That brings up five containers:

- **`mongo`** — MongoDB 7 on a named volume
- **`api`** — the Go API (built from `./api`)
- **`web`** — the Next.js admin (built from `./web`)
- **`caddy`** — reverse proxy, dev config on plain HTTP, exposed on host port **8080**
- **`demo`** — a standalone Next.js App Router site used to exercise the tracker end-to-end, exposed on host port **3001**

Open <http://localhost:8080> and sign in with the credentials from your `.env` (`root` / `changeme` by default in `.env.example`).

The demo site at <http://localhost:3001> has a settings banner where you paste in a site ID from one of your properties — after that, clicking around the demo fires real tracker events into your Pager instance.

## Architecture at a glance

```
    Tracked sites   ──▶  Caddy (:443 / :80)  ──┬──▶  Go API      ──▶  MongoDB
    (paste snippet)                            │      /pub/*
                                               │      /int/api/*
                                               │
                                               └──▶  Next.js admin
                                                     /  (everything else)
```

- `/pub/p.js` — tracker snippet (public, cached 5 min).
- `/pub/collect` — ingest endpoint (public, CORS-simple).
- `/int/api/*` — admin REST (cookie-auth).
- Everything else → Next.js admin UI.

`/api/*` is intentionally left free for any future Next.js route handlers — Pager's admin API sits under `/int/api/*` so there's no chance of collision.

## Repo layout

```
api/                              Go service
  cmd/pager/main.go               entrypoint + route table
  internal/
    auth/                         login, cookie middleware, /me
    config/                       env loader
    geo/                          optional MMDB country lookup
    goals/                        goal CRUD + at-ingest matcher
    httpx/                        thin JSON/HTTP helpers
    ingest/                       /pub/collect + visitor/session/event writes
    mongox/                       driver + EnsureIndexes
    properties/                   property CRUD
    reports/                      overview / campaigns / sources / visitors / timeline
    session/                      opaque admin session tokens
    tracker/                      embeds tracker.js and serves /pub/p.js
    ua/                           user-agent parser
    users/                        users collection + seed on boot
  Dockerfile
web/                              Next.js admin (App Router)
  app/(admin)/                    auth-gated sections
  components/                     ui/*, sparkline, section, range picker
  lib/api.ts                      typed fetch wrapper
  middleware.ts                   cookie-presence gate for admin routes
  Dockerfile
proxy/                            Caddyfile (prod + Caddyfile.dev)
examples/
  next-demo/                      standalone Next.js site for tracker E2E
  e2e/verify.mjs                  Playwright verifier (drives real Chromium)
  test.html                       static HTML page for manual smoke tests
scripts/install.sh                Ubuntu bootstrap
docker-compose.yml                prod-shaped compose
docker-compose.dev.yml            overlay: adds `demo`, swaps Caddyfile.dev
.env.example
```

## Iterating on each layer

### API (Go)

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build api
```

The `api` service's Dockerfile is a two-stage build; `--build api` recompiles just that image and restarts the container. On a warm build this takes ~15 seconds.

If you'd rather iterate outside of Docker:

```bash
cd api && go build ./... && go vet ./...
```

The API needs `MONGO_URI`, `ROOT_PASSWORD`, and `SESSION_PEPPER` in the environment. Easiest is to source your `.env` and point `MONGO_URI` at the docker-exposed mongo (or run mongo locally).

### Web (Next.js)

Same pattern:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build web
```

Or, for faster iteration:

```bash
cd web && npm install && npm run dev
```

Then point your browser at http://localhost:3000 and configure it to hit the API via Caddy at :8080. The dev server won't have same-origin cookies for the admin API unless you proxy — for most UI-only changes it's simpler to keep using the `--build web` docker loop.

### Tracker

`api/internal/tracker/tracker.js` is embedded into the Go binary via `//go:embed`. To pick up snippet changes, rebuild the API:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build api
```

Then hard-reload any page loading the snippet.

## Running the E2E

There's a Playwright-based verifier that drives real Chromium through the demo site, exercises SPA navigation + a custom event, and asserts against Pager's own report APIs.

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
docker run --rm --network=pager_pager \
  -v "$(pwd)/examples/e2e:/e2e" \
  -w /e2e \
  -e PAGER_URL=http://caddy \
  -e DEMO_URL=http://demo:3000 \
  mcr.microsoft.com/playwright:v1.47.0-jammy \
  bash -c "npm install --silent && node verify.mjs"
```

Exit code 0 means the tracker's SPA handling, CORS, custom events, goal matcher, and UTM attribution all work end-to-end.

If you renamed the seeded root user, pass credentials via env:

```bash
... -e ROOT_USERNAME=myname -e ROOT_PASSWORD=… mcr.microsoft.com/playwright:...
```

## Seeded credentials on first boot

On first boot, `EnsureRootExists` creates a root user only if **no root user exists in the DB**. It reads `ROOT_USERNAME` / `ROOT_PASSWORD` from env for that seed.

- Renaming yourself via the UI doesn't re-trigger seeding — the seed check counts roots, not usernames.
- If you delete every root somehow (the UI guardrail should prevent this), the seed re-creates one on next boot with the env values. Recovery path.
- To fully reset the users table locally:

```bash
docker compose exec -T mongo mongosh pager --eval 'db.users.deleteMany({}); db.admin_sessions.deleteMany({});'
docker compose restart api
```

The next boot re-seeds `ROOT_USERNAME` from `.env`.

## Resetting local data

Nuke everything (users, properties, events, sessions):

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml down -v
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

`-v` drops the mongo + caddy volumes. This is the sledgehammer.

Softer — wipe just Pager data, keep containers:

```bash
docker compose exec -T mongo mongosh pager --eval '
  db.events.deleteMany({});
  db.visitors.deleteMany({});
  db.tracking_sessions.deleteMany({});
  db.properties.deleteMany({});
  db.goals.deleteMany({});
  db.admin_sessions.deleteMany({});
  db.users.deleteMany({});
'
docker compose restart api
```

## Env vars (dev)

For local dev you can copy `.env.example`. The only things worth changing:

- `ROOT_USERNAME` / `ROOT_PASSWORD` — the seeded root user's credentials.
- `SESSION_PEPPER` — any 32+ chars; changing it invalidates every admin session.
- `PAGER_DOMAIN` — leave as `localhost` for dev.

The dev compose overlay ignores `PAGER_DOMAIN` for TLS purposes and serves plain HTTP on `:8080` via `proxy/Caddyfile.dev`.

## Common tasks

Poke at Mongo:

```bash
docker compose exec mongo mongosh pager
```

Watch tracker beacons hit `/pub/collect`:

```bash
docker compose logs -f api | grep collect
```

Regenerate the CSS bundle after editing Tailwind classes: the Next.js production build regenerates on `--build web`. If you're running `npm run dev`, HMR handles it.

Rebuild the demo Next.js site (only needed if you edit `examples/next-demo/`):

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build demo
```
