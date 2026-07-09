---
name: pager-tracking
description: Instrument a website with Pager tracking — install the snippet, fire custom events with window.pager, build UTM-tagged campaign links, and define conversion goals. Use when the user wants to ADD or CHANGE tracking on their site (add the script, track a signup/purchase/click, set up a goal, or generate a campaign URL), as opposed to just reading analytics. Complements the read-only pager-insights skill; use the MCP `list_properties` tool to read the correct siteId.
---

# Pager Tracking — instrumentation guide

This skill makes you fluent in *implementing* Pager tracking. It pairs with the
`pager-insights` skill (which reads data): insights tell you *what to track*,
this tells you *how to wire it up*. All facts below reflect how Pager's tracker
(`/pub/p.js`) and ingest actually behave — follow them exactly.

## 0. Always start from the real siteId

Never invent a siteId. Call the MCP tool **`list_properties`** and use the
`siteId` (public, 8 chars) and `domain` of the property the user means. The
snippet is served from the Pager instance itself, so the script `src` host is
the same host as `PAGER_URL` (e.g. `https://pager.grabthe.email`).

## 1. Installing the snippet

The tracker self-configures from its own `<script>` tag. Minimum:

```html
<script src="https://YOUR-PAGER-HOST/pub/p.js" data-site-id="SITEID"></script>
```

Attributes:

| Attribute            | Required | Purpose |
|----------------------|----------|---------|
| `data-site-id`       | ✅       | The property's public `siteId`. Without it the script no-ops. |
| `data-endpoint`      | –        | Override the collect URL. Defaults to `/pub/collect` on the script's own origin — only set this if the site loads `p.js` from a different host than it should POST to. |
| `data-cookie-domain` | –        | Set to `.example.com` when **one property spans multiple subdomains** (www + app + …) so a visitor keeps one identity across them. Omit for a single host. |

What the snippet does automatically once loaded:

- Sets first-party cookies `_pgr_v` (visitor, 2-year sliding) and `_pgr_s`
  (session, 30-min idle) on the site's own domain.
- Fires a **pageview on load**, and again on **SPA navigation** — it wraps
  `history.pushState`/`replaceState` and listens for `popstate`, so
  client-side route changes are tracked with no extra code (Next.js App
  Router, React Router, etc. work out of the box). Same-URL replaces are
  no-ops.

**Next.js (App Router):**

```tsx
// app/layout.tsx
import Script from "next/script";
// ...
<Script
  src="https://YOUR-PAGER-HOST/pub/p.js"
  data-site-id="SITEID"
  strategy="afterInteractive"
/>
```

Do **not** add per-route pageview calls in an SPA — the history hooks already
cover navigation; manual calls would double-count.

## 2. Custom events — `window.pager(name, props)`

Fire a named event with an optional flat props object:

```js
window.pager("signup_completed", { plan: "pro", trial: false });
window.pager("add_to_cart", { sku: "BRISKET-1KG", qty: 2, price: 24.0 });
```

Rules that matter:

- `name` is required and is what **event goals** match on (exact string) — pick
  stable `snake_case` names and don't rename casually.
- `props` is arbitrary JSON, stored on the event and visible in
  `visitor_timeline`. Keep keys consistent; prefer primitives. There is no
  aggregate props report yet, so props are for per-visitor inspection today.
- Events do **not** create pageviews and don't change the URL.

**Firing before the script loads (avoid dropped early events):** define a queue
stub *above* the snippet. The tracker replays `window.pager.q` on load:

```html
<script>
  window.pager = window.pager || function () {
    (window.pager.q = window.pager.q || []).push(arguments);
  };
</script>
<!-- ...then the /pub/p.js snippet ... -->
```

## 3. UTM campaign links

On every pageview the tracker reads these query params off the current URL and
attaches them to the session (first pageview of the session wins) and the
visitor's `firstUtm`:

`utm_source`, `utm_medium`, `utm_campaign`, `utm_term`, `utm_content`

(stored without the `utm_` prefix as `source`/`medium`/`campaign`/`term`/`content`).

So a campaign link is just a destination URL with those params:

```
https://menu.meat-smoke.com/?utm_source=instagram&utm_medium=paid&utm_campaign=summer_bbq&utm_content=story_1
```

Guidance when generating links:
- `source` = where it's posted (`instagram`, `newsletter`), `medium` = the type
  (`paid`, `email`, `social`, `cpc`), `campaign` = the initiative name.
- Keep values lowercase and consistent — the `sources`/`campaigns` reports group
  by exact string, so `Instagram` and `instagram` split into two rows.
- URL-encode values with spaces. Prefer `_` over spaces.
- These map directly to what the MCP `campaigns` tool groups by
  (`groupBy=source|medium|campaign`).

## 4. Conversion goals

A goal is one of two kinds (see `list_goals` for what a property already has):

- **`url`** — `pattern` is a **regex matched against the event `path`**.
- **`event`** — `pattern` is the **exact custom-event name**.

Critical nuances for URL goals (get these right or goals silently mis-fire):

- `path` is `location.pathname + location.search` — it **includes the query
  string**. Account for query params in patterns.
- Matching is **RE2 (Go regexp), unanchored** (`MatchString`). So `order`
  matches `/my-order-history` too. **Anchor with `^`** for path prefixes.
- Escape regex metacharacters — notably `?` in a query string.

Good examples:

| Goal | kind | pattern | Matches |
|------|------|---------|---------|
| Reached order page | `url` | `^/order` | `/order`, `/order/summary`, `/order?x=1` |
| Placed order (paid) | `url` | `^/order/paid(\?\|$)` | `/order/paid`, `/order/paid?ref=x` — not `/order/paid-later` |
| Signup completed | `event` | `signup_completed` | the `window.pager("signup_completed", …)` call |

**Creating goals is a write action the plugin cannot do.** The MCP server is
read-only (viewer account). So don't try to create goals via the tools. Instead:

1. Read current goals with `list_goals` to avoid duplicates.
2. Hand the user the exact goal to add — its **name, kind, and pattern** — to
   create in the Pager admin UI (or via `POST /int/api/properties/{id}/goals`
   with an admin/root session if they want the API). Present it as a copy-ready
   spec, e.g. *"Add a `url` goal named 'Placed order' with pattern
   `^/order/paid(\?|$)`."*

## 5. Verifying instrumentation worked

After the user deploys a change:

1. **Client side:** in the browser Network tab, confirm a `POST` to
   `/pub/collect` fires on page load / on the event (returns `204`). An unknown
   siteId also returns `204` silently, so also check the payload's `siteId`.
2. **Server side (via MCP):** wait for traffic, then use `overview` (pageviews
   climbing), and for a specific test visit use `list_visitors` →
   `visitor_timeline` to confirm the event/props and any `goalsHit` show up.

## 6. Recipe: turning an insight into instrumentation

When `pager-insights` recommends tracking (e.g. "you have no checkout events"):

1. `list_properties` → get the siteId.
2. Decide the events/goals: name the events, write the goal specs.
3. Produce the concrete changes: the `window.pager(...)` call sites in their
   code, any UTM links, and the copy-ready goal specs for the UI.
4. Tell them how to verify (section 5).

Be concrete and match the site's existing code style when editing their source.
