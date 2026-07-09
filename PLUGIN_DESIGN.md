# Pager Insights — Claude Plugin Design

A Claude Code plugin that lets Claude examine a Pager instance's properties and
tracked data, and turn it into plain-language analytics insights.

Status: **design** — no code yet. This doc is the spec we build from.

---

## 1. Goal

Point Claude at a running Pager instance and ask questions like:

- "How did traffic on the marketing site do this week vs last?"
- "Which campaigns actually convert, and which are burning referral traffic?"
- "Show me what this visitor did before they signed up."
- "Anything weird in the last 24h?"

Claude answers by pulling the right reports from Pager's read API and reasoning
over them — no manual dashboard clicking, no CSV exports.

**Read-only by design.** The plugin never creates, edits, or deletes properties,
goals, users, or data. It is safe to point at production.

---

## 2. Shape of the plugin

A standard Claude Code **plugin bundle** with three parts:

```
pager-insights/
├── .claude-plugin/
│   └── plugin.json          # manifest: name, version, mcpServers, etc.
├── mcp/
│   └── server.(ts|py)       # MCP server wrapping Pager's read API
├── skills/
│   └── pager-insights/
│       └── SKILL.md         # how Claude should reason over the data
└── commands/
    └── pager-insights.md    # /pager-insights slash command entrypoint
```

### 2.1 MCP server — the data access layer

The core of the plugin. Speaks Pager's HTTP API and exposes clean, typed,
**read-only** tools. Handles the cookie-auth handshake so Claude never sees
credentials.

Config (env, read at server start):

| Var              | Meaning                                             |
|------------------|-----------------------------------------------------|
| `PAGER_URL`      | Base URL, e.g. `https://metrics.example.com`        |
| `PAGER_USER`     | Login username — **use a dedicated `viewer` account** |
| `PAGER_PASSWORD` | That account's password                             |

Auth flow (chosen approach — Pager is cookie-only today):

1. On first tool call, `POST {PAGER_URL}/int/api/auth/login` with
   `{username, password}`.
2. Capture the `pgr_admin` cookie from the `Set-Cookie` header.
3. Reuse it on every subsequent request; re-login transparently on `401`.

> A `viewer` account is enough — every report endpoint is gated by `read`, which
> viewers have. Never put a `root`/`admin` credential in the plugin config.

Tools exposed (each maps 1:1 to a read endpoint):

| Tool               | Endpoint                                             | Purpose |
|--------------------|------------------------------------------------------|---------|
| `list_properties`  | `GET /int/api/properties`                            | Discover sites + their `siteId`/name/domain |
| `get_property`     | `GET /int/api/properties/{id}`                       | One property's details |
| `overview`         | `GET /int/api/properties/{id}/overview`              | Totals + timeseries (visitors/sessions/pageviews/events) |
| `sources`          | `GET /int/api/properties/{id}/sources`               | Referrer hosts w/ conversion rate |
| `campaigns`        | `GET /int/api/properties/{id}/campaigns`             | UTM attribution (`groupBy=source\|medium\|campaign`) w/ conversion rate |
| `list_goals`       | `GET /int/api/properties/{id}/goals`                 | Conversion goals defined for a property |
| `list_visitors`    | `GET /int/api/properties/{id}/visitors`              | Recent visitors (sorted by last seen) |
| `visitor_timeline` | `GET /int/api/properties/{id}/visitors/{vid}/timeline` | One visitor's full session/event history |

Shared parameters passed through to the API:

- `range`: `24h` \| `7d` \| `30d` \| `90d` (default `24h`), **or** `from`/`to` as
  RFC3339 timestamps for custom windows.
- `goalId` (optional) on `sources`/`campaigns` to attribute conversions to a
  specific goal.
- `limit` on `list_visitors` (default 50).
- `groupBy` on `campaigns`.

Each tool returns the API's JSON as-is (already clean, JSON-tagged structs), so
Claude works with the same field names the UI uses (`visitors`, `sessions`,
`pageviews`, `events`, `conversionRate`, etc.).

**Why MCP and not just curl?** Typed tools mean Claude picks the right endpoint
and parameters instead of guessing URLs, credentials stay in server config, and
the read-only surface is enforced structurally — there is no write tool to call.

### 2.2 Skill — how to reason over the data

`skills/pager-insights/SKILL.md` teaches Claude the analysis playbook so results
are consistent instead of ad-hoc:

- **Orient first.** Call `list_properties`; if the user didn't name a site, ask
  which one (or summarize all).
- **Layer the picture.** `overview` for the shape of traffic → `sources` and
  `campaigns` for where it comes from and what converts → `list_goals` to know
  what "conversion" means for this property.
- **Compare, don't just report.** When asked "how are we doing," pull the current
  range and the previous equal-length window (via `from`/`to`) and report deltas,
  not just absolutes.
- **Flag, don't dump.** Surface the notable things — a traffic dip, a campaign
  with high sessions but ~0 conversion, a new top referrer — rather than
  reciting every row.
- **Drill down on demand.** For "what did X do," use `list_visitors` →
  `visitor_timeline`.
- **Respect the data model.** A *visitor* is a person (`_pgr_v`), a *session* is a
  visit (`_pgr_s`, 30-min idle), *conversionRate* is 0..1. Don't conflate them.

### 2.3 Slash command — the entrypoint

`/pager-insights [question]` — a thin command that loads the skill and kicks off
an analysis, e.g. `/pager-insights how did the blog do last week?`. Without a
question it produces a cross-property health summary for the last 24h.

---

## 3. Implementation language

MCP server in **TypeScript** (`@modelcontextprotocol/sdk`) — matches the Next.js
side of the repo, easy to ship as an `npx`-runnable package. Python
(`mcp` SDK) is a fine alternative if we'd rather keep the plugin dependency-free
of the web toolchain. Decide at build time; the design is identical either way.

---

## 4. Distribution & install

- Live in this repo under `plugins/pager-insights/` (keeps it versioned with the
  API it targets), or split into its own repo later.
- Install via a Claude Code plugin marketplace entry, or locally by pointing
  `plugin.json`'s `mcpServers` at the built server and setting the three env vars.
- Document setup in the plugin's own README: create a `viewer` user in the Pager
  UI, set `PAGER_URL`/`PAGER_USER`/`PAGER_PASSWORD`, install the plugin.

---

## 5. Security notes

- Credentials live only in the MCP server's env, never in prompts or tool args.
- Recommend (and document) a dedicated **`viewer`** account — least privilege;
  even if leaked it can only read reports.
- No write/delete tools exist, so the plugin cannot mutate the instance.
- The plugin talks to the same public HTTPS endpoint the UI uses; no new port or
  network path is opened.

---

## 6. Future extensions (out of scope for v1)

- **Add a real read-only API token to Pager** (the auth alternative we deferred):
  a token-auth path + token management in the Go API, so the plugin authenticates
  without storing a password. Cleaner long-term; a backend change we can do later.
- Anomaly-detection tool that diffs ranges server-side.
- Scheduled digest (via Claude Code `/loop` or a cron routine) that posts a daily
  summary.
- Raw event/props querying for custom-event analytics once an endpoint exists
  (today `props` is only reachable through `visitor_timeline`).
