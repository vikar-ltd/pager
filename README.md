# Pager

A self-hosted web visit tracker. Like Yandex Metrica, but smaller, nicer to deploy, and yours.

- **Stack** — MongoDB + Go API + Next.js admin UI, fronted by Caddy with automatic Let's Encrypt.
- **Deploy** — one shell script bootstraps a fresh Ubuntu server. Everything runs in `docker compose`.
- **Track** — paste a tiny JavaScript snippet onto your site. The snippet handles SPA navigation (Next.js App Router works out of the box) and lets you fire custom events.
- **Measure** — define goals as URL patterns or custom events; the admin ranks campaigns and traffic sources by conversion.

## Install (production, fresh Ubuntu)

```bash
sudo ./scripts/install.sh --domain pager.example.com --email you@example.com
```

Or, in one line from any Ubuntu box:

```bash
curl -fsSL https://raw.githubusercontent.com/vikar-ltd/pager/main/scripts/install.sh \
  | sudo bash -s -- --domain pager.example.com --email you@example.com
```

The script:

1. Installs Docker Engine + the compose plugin from Docker's official apt repo.
2. Clones the repo into `/opt/pager` (customisable with `--dir`).
3. Generates `.env` with a random `ADMIN_PASSWORD` (32 base62 chars) and `SESSION_PEPPER`.
4. Runs `docker compose up -d --build`.
5. Waits for the API health check, then prints the URL and credentials.

It's idempotent — re-running preserves the existing `.env` and just recycles the containers.

## Local development

```bash
cp .env.example .env
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

- Admin UI: <http://localhost:8080> (login `admin` / `changeme` from `.env.example`)
- Demo Next.js site for tracker testing: <http://localhost:3001>
- Mongo: internal only

The dev overlay (`docker-compose.dev.yml`) swaps in a plain-HTTP `Caddyfile.dev`, exposes Caddy on host port `:8080`, and starts a standalone Next.js demo (`examples/next-demo`) on `:3001`.

## Adding the snippet to a Next.js site

```tsx
// app/layout.tsx
import Script from "next/script";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html>
      <body>
        {children}
        <Script
          src="https://YOUR-PAGER-DOMAIN/pub/p.js"
          data-site-id="YOUR_SITE_ID"
          strategy="afterInteractive"
        />
      </body>
    </html>
  );
}
```

The snippet monkey-patches `history.pushState` / `replaceState` and listens to `popstate`, so App Router client-side navigations fire pageviews automatically. **No `usePathname()` effect required.**

Fire a custom event:

```ts
window.pager?.("signup_completed", { plan: "pro" });
```

## Adding the snippet to a plain HTML site

```html
<script src="https://YOUR-PAGER-DOMAIN/pub/p.js" data-site-id="YOUR_SITE_ID"></script>
```

## Concepts

- **Property** — a site you want to track. Each property has a public `siteId` used in the snippet.
- **Visitor** — one person, identified by the `_pgr_v` cookie set on the tracked site (2-year TTL).
- **Tracking session** — a window of activity for a visitor, identified by `_pgr_s` (30-minute sliding idle).
- **Goal** — a conversion criterion. Two kinds:
  - `url` — regex matched against the event path (e.g. `^/signup`)
  - `event` — exact match on the custom event name (e.g. `signup_completed`)

Goals are evaluated at ingest time; each session accumulates the set of goal IDs it hit (`goalsHit`). Reports use that to compute conversion rates per campaign and traffic source.

## URL layout

Caddy in front routes:

- `/pub/p.js` — the tracker snippet (public, cached 5 min).
- `/pub/collect` — event ingest (public, CORS-simple).
- `/int/api/*` — admin REST (cookie-auth).
- `/` — Next.js admin UI.

`/api/*` is intentionally left free for any future Next.js route handlers.

## Repository layout

```
api/                Go API + embedded tracker.js
web/                Next.js admin (App Router)
proxy/              Caddyfile (prod + dev)
examples/
  next-demo/        Standalone Next.js site for tracker E2E
  e2e/              Playwright verifier that drives the demo
scripts/install.sh  Ubuntu bootstrap
docker-compose.yml
docker-compose.dev.yml
```

## Verifying the tracker end-to-end

The Playwright verifier drives a real Chromium through the demo's SPA navigation and asserts against Pager's report APIs (visitor count, session count, pageview paths, custom events, goal hits, UTM attribution).

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

Exit code 0 means the tracker's SPA handling, CORS setup, custom events, goal matcher, and UTM attribution are all working.

## Non-goals (v1)

- No multi-step funnel goals — single-step hits only.
- No data retention/expiry job — Mongo grows unbounded; manual cleanup for now.
- No bot filtering beyond obvious UA patterns.
- No multi-user / RBAC — single admin per deployment.
- No email/Slack alerts.

These are explicit deferrals, not oversights.
