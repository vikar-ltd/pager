# Pager Insights — Claude plugin

Ask Claude about your [Pager](../../README.md) analytics in plain language.
Claude examines your tracked properties and data through a **read-only** MCP
server and turns it into insights — traffic trends, top sources, campaign
performance, conversion rates, and individual visitor journeys.

> Read-only by design. The plugin can only read reports. It cannot create, edit,
> or delete properties, goals, users, or data — safe to point at production.

## What you get

- **MCP tools** (one per Pager report endpoint): `list_properties`,
  `get_property`, `overview`, `sources`, `campaigns`, `list_goals`,
  `list_visitors`, `visitor_timeline`.
- **`/pager-insights` command** — ask a question, or run it bare for a 24h
  cross-property health briefing.
- **A skill** that teaches Claude the analysis playbook (compare windows, flag
  what's notable, respect visitor ≠ session).

## Setup

1. **Create a dedicated `viewer` user** in your Pager admin UI. Least privilege:
   viewers can read every report but nothing else. Don't use a root/admin login.

2. **Build the MCP server:**

   ```sh
   cd plugins/pager-insights/mcp
   npm install
   npm run build
   ```

3. **Set the three env vars** where Claude Code will launch the server:

   | Var              | Example                        |
   |------------------|--------------------------------|
   | `PAGER_URL`      | `https://metrics.example.com`  |
   | `PAGER_USER`     | `insights-viewer`              |
   | `PAGER_PASSWORD` | (that account's password)      |

4. **Install the plugin** in Claude Code (add this directory as a plugin, or
   register it via a marketplace entry). The manifest wires the MCP server, the
   skill, and the command automatically.

## Usage

```
/pager-insights how did the blog do last week vs the week before?
/pager-insights which campaigns convert best?
/pager-insights                     # bare → 24h health summary across all sites
```

Or just ask naturally — "what's my top traffic source this month?" — and the
skill kicks in.

## How auth works

Pager is cookie-authenticated. On first tool call the server logs in with
`PAGER_USER`/`PAGER_PASSWORD`, caches the `pgr_admin` session cookie, and reuses
it (re-logging in automatically if the session expires). Credentials live only in
the server's environment — never in prompts or tool arguments.
