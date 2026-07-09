---
name: pager-insights
description: Analyze a Pager visitor-tracker instance and produce analytics insights. Use when the user asks about their site traffic, visitors, sources, campaigns, conversions, or goals tracked in Pager, or asks "how is my site doing". Requires the pager-insights plugin's MCP tools (list_properties, overview, sources, campaigns, list_goals, list_visitors, visitor_timeline).
---

# Pager Insights

You have read-only MCP tools that query a Pager instance's report API. Use them
to answer questions about tracked traffic, then explain what the numbers *mean* —
don't just dump rows.

## Data model — get this right

- **Property** — one tracked site. Has an `id` (use this in tool calls), a `name`,
  a `domain`, and a public `siteId`.
- **Visitor** — one person (the `_pgr_v` cookie). Identified across sessions.
- **Session** — one visit (the `_pgr_s` cookie, 30-min idle timeout). One visitor
  has many sessions. Never conflate visitors with sessions.
- **Pageview / event** — an event of `type: "pageview"` or a custom event with a
  `name` and optional `props`.
- **Goal** — a conversion criterion: a `url` regex or an exact custom-event `name`.
- **conversionRate** is a fraction `0..1` (multiply by 100 for a percentage).

## Playbook

1. **Orient.** Call `list_properties`. If the user named a site, match it; if not
   and there are several, ask which one — or, for a "how's everything doing"
   question, summarize each briefly.
2. **Layer the picture** for the chosen property:
   - `overview` — the shape and volume of traffic over the range.
   - `sources` and `campaigns` — where traffic comes from and what converts.
   - `list_goals` — so you know what "conversion" means here before citing rates.
3. **Compare, don't just report.** For "how are we doing / trend" questions, pull
   the current window *and* the previous equal-length window using `from`/`to`
   (RFC3339), and report deltas (e.g. "visitors +18% vs the prior 7 days"), not
   just absolutes.
4. **Flag, don't dump.** Surface what's notable: a traffic dip or spike, a
   campaign with many sessions but a near-zero conversion rate, a newly dominant
   referrer, a goal that stopped firing. Lead with the finding, support it with
   the number.
5. **Drill down on request.** For "what did this visitor do" or "show me a
   converting journey," use `list_visitors` then `visitor_timeline`.

## Ranges

Every traffic tool accepts either `range` (`24h`/`7d`/`30d`/`90d`) or an explicit
`from`/`to` pair (RFC3339). Use `from`/`to` for custom windows and for
period-over-period comparisons.

## Style

- Be concise and quantitative. Round sensibly; show percentages for rates.
- State the window and property you're reporting on.
- If a tool errors (e.g. auth), say so plainly and suggest checking the plugin's
  `PAGER_URL`/`PAGER_USER`/`PAGER_PASSWORD` config.
- You are read-only. You cannot change properties, goals, users, or data — don't
  offer to.
