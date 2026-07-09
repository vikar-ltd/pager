# Pager Insights — Claude plugin

Ask Claude about your [Pager](../../README.md) analytics in plain language.
Claude examines your tracked properties and data through a **read-only** MCP
server and turns it into insights — traffic trends, top sources, campaign
performance, conversion rates, and individual visitor journeys.

> Mostly read-only. Every report is read-only; the only writes are `create_goal`
> and `update_goal` for conversion-goal management, and only when configured with
> an admin/root account. There are deliberately no delete or user-management
> tools, so the plugin can never remove a property, drop data, or touch accounts.

## What you get

- **Read tools** (one per Pager report endpoint): `list_properties`,
  `get_property`, `overview`, `sources`, `campaigns`, `list_goals`,
  `list_visitors`, `visitor_timeline`.
- **Write tools** for goal management: `create_goal`, `update_goal`. These
  require an **admin/root** account (see [Write access](#write-access)); with a
  viewer account they return `403` and the rest of the plugin still works.
- **`/pager-insights` command** — ask a question, or run it bare for a 24h
  cross-property health briefing.
- **Two skills:**
  - `pager-insights` — the analysis playbook (compare windows, flag what's
    notable, respect visitor ≠ session).
  - `pager-tracking` — how to *instrument* a site: install the snippet, fire
    custom events, build UTM campaign links, and define conversion goals.
    Turns an insight ("no checkout events") into concrete code + goal specs.

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

## Write access

The read tools work with a **viewer** account — least privilege, recommended if
you only want insights. The goal-write tools (`create_goal`, `update_goal`) call
mutating endpoints that Pager gates behind `CanWrite()`, i.e. an **admin or
root** role. To enable them:

- Point `PAGER_USER`/`PAGER_PASSWORD` at an **admin** account. A dedicated
  `claude-agent` admin is best — its writes are attributable in
  `admin_sessions` (IP/UA) and you can revoke it independently.
- Trade-off to accept knowingly: an admin credential can do more on the instance
  than this plugin exposes (e.g. delete properties, manage viewer users) *via
  other clients*. The plugin itself ships no such tools, but the account is only
  as safe as where you store it — hence the Keychain approach below.

With a viewer account the write tools simply return `403` and everything else
keeps working.

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
