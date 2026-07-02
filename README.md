# Pager

A self-hosted web visit tracker. Like Yandex Metrica, but smaller, nicer to deploy, and yours.

- **Stack** — MongoDB + Go API + Next.js admin UI, fronted by Caddy with automatic Let's Encrypt.
- **Deploy** — one shell script bootstraps a fresh Ubuntu server. Everything runs in `docker compose`.
- **Track** — paste a tiny JavaScript snippet onto your site. Next.js App Router SPA navigation works out of the box; custom events with `window.pager('name', props)`.
- **Measure** — define goals as URL patterns or custom events; rank campaigns and traffic sources by conversion.
- **Multi-user** — three roles (`root` / `admin` / `viewer`) with granular management from the UI.

## Getting started

- **Running Pager on your own server** → [DEPLOYMENT.md](DEPLOYMENT.md) — install, hardware recommendations, TLS, backups, upgrading, retention.
- **Working on the code** → [DEVELOPMENT.md](DEVELOPMENT.md) — local dev, repo layout, iterating on each layer, running the Playwright E2E.

Once your instance is up, adding the tracker to a Next.js site is:

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

Or plain HTML:

```html
<script src="https://YOUR-PAGER-DOMAIN/pub/p.js" data-site-id="YOUR_SITE_ID"></script>
```

Custom event:

```ts
window.pager?.("signup_completed", { plan: "pro" });
```

## Concepts

- **User** — signs into the admin. Three roles: `root` (full control), `admin` (read-write + can manage viewers), `viewer` (read-only). Seeded from `ROOT_USERNAME` / `ROOT_PASSWORD` env on first boot; all further user management goes through the UI.
- **Property** — a site you track. Each has a public `siteId` used in the snippet.
- **Visitor** — one person, identified by the `_pgr_v` cookie (2-year sliding TTL).
- **Tracking session** — a browsing window, identified by `_pgr_s` (30-minute sliding idle).
- **Goal** — a conversion criterion. Two kinds:
  - `url` — regex matched against the event path (e.g. `^/signup`).
  - `event` — exact match on the custom event name (e.g. `signup_completed`).

## URL layout

- `/pub/p.js` — the tracker snippet (public, cached).
- `/pub/collect` — event ingest (public, CORS-simple).
- `/int/api/*` — admin REST (cookie-auth).
- `/` — Next.js admin UI.

`/api/*` is intentionally free for any future Next.js route handlers.

## Non-goals (v1)

- No multi-step funnel goals — single-step hits only.
- No automatic data retention. Prune manually or add a TTL index (see [DEPLOYMENT.md](DEPLOYMENT.md#retention--pruning)).
- No bot filtering beyond obvious UA patterns.
- No email / Slack alerts.

These are explicit deferrals, not oversights.
