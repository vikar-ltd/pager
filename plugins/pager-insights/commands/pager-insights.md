---
description: Analyze your Pager visitor-tracker data and surface insights.
argument-hint: [question, e.g. "how did the blog do last week?"]
---

Use the **pager-insights** skill and the Pager MCP tools to answer the user's
analytics question.

Question: $ARGUMENTS

If no question was given, produce a cross-property health summary for the last
24 hours: call `list_properties`, then `overview` for each property, and report
the notable movements (traffic volume, and anything that stands out in sources or
conversions). Keep it to a scannable briefing, not a data dump.
