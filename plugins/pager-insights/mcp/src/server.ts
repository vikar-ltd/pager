/**
 * Pager Insights — MCP server.
 *
 * Read-only wrapper around a Pager instance's report API. Logs in once with the
 * configured (ideally `viewer`) credentials, caches the `pgr_admin` session
 * cookie, and re-authenticates transparently on 401. Every tool maps 1:1 to a
 * GET report endpoint — there is deliberately no write/delete surface.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const PAGER_URL = requireEnv("PAGER_URL").replace(/\/+$/, "");
const PAGER_USER = requireEnv("PAGER_USER");
const PAGER_PASSWORD = requireEnv("PAGER_PASSWORD");

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[pager-insights] missing required env var ${name}`);
    process.exit(1);
  }
  return v;
}

/** Cached session cookie value (the raw `pgr_admin=...` pair). */
let cookie: string | null = null;

async function login(): Promise<void> {
  const res = await fetch(`${PAGER_URL}/int/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: PAGER_USER, password: PAGER_PASSWORD }),
  });
  if (!res.ok) {
    throw new Error(`login failed: ${res.status} ${await safeText(res)}`);
  }
  // Node's fetch exposes the combined header; take the pgr_admin pair.
  const setCookie = res.headers.get("set-cookie") ?? "";
  const match = setCookie.match(/pgr_admin=[^;]+/);
  if (!match) {
    throw new Error("login succeeded but no pgr_admin cookie was returned");
  }
  cookie = match[0];
}

/** GET a report endpoint, logging in on first use and retrying once on 401. */
async function apiGet(
  path: string,
  params?: Record<string, string | number | undefined>,
): Promise<unknown> {
  const url = new URL(`${PAGER_URL}${path}`);
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }

  const doFetch = () =>
    fetch(url, { headers: cookie ? { cookie } : {} });

  if (!cookie) await login();
  let res = await doFetch();
  if (res.status === 401) {
    await login();
    res = await doFetch();
  }
  if (!res.ok) {
    throw new Error(`GET ${path} → ${res.status} ${await safeText(res)}`);
  }
  return res.json();
}

/** Send a JSON body (POST/PATCH) to a write endpoint, with the same auth retry. */
async function apiSend(
  method: "POST" | "PATCH",
  path: string,
  body: unknown,
): Promise<unknown> {
  const doFetch = () =>
    fetch(`${PAGER_URL}${path}`, {
      method,
      headers: { ...(cookie ? { cookie } : {}), "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  if (!cookie) await login();
  let res = await doFetch();
  if (res.status === 401) {
    await login();
    res = await doFetch();
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} → ${res.status} ${await safeText(res)}`);
  }
  return res.json();
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

/** Wrap a JSON result in the MCP text-content envelope. */
function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

// Shared parameter schemas ---------------------------------------------------

const rangeShape = {
  range: z
    .enum(["24h", "7d", "30d", "90d"])
    .optional()
    .describe("Relative window. Ignored if from/to are given. Defaults to 24h."),
  from: z.string().optional().describe("RFC3339 start of a custom window (use with `to`)."),
  to: z.string().optional().describe("RFC3339 end of a custom window (use with `from`)."),
};

const propId = z.string().describe("Property id (the Mongo _id, from list_properties).");

// Server ---------------------------------------------------------------------

const server = new McpServer({ name: "pager-insights", version: "0.1.0" });

server.tool(
  "list_properties",
  "List all tracked properties (sites) with their id, name, domain, and public siteId. Start here to discover what to analyze.",
  {},
  async () => ok(await apiGet("/int/api/properties")),
);

server.tool(
  "get_property",
  "Get one property's details by id.",
  { id: propId },
  async ({ id }) => ok(await apiGet(`/int/api/properties/${id}`)),
);

server.tool(
  "overview",
  "Traffic overview for a property: totals (visitors, sessions, pageviews, events) plus a timeseries over the range.",
  { id: propId, ...rangeShape },
  async ({ id, range, from, to }) =>
    ok(await apiGet(`/int/api/properties/${id}/overview`, { range, from, to })),
);

server.tool(
  "sources",
  "Referrer hosts for a property with sessions, visitors, conversions, and conversionRate (0..1). Pass goalId to attribute a specific goal.",
  { id: propId, goalId: z.string().optional().describe("Restrict conversions to this goal id."), ...rangeShape },
  async ({ id, goalId, range, from, to }) =>
    ok(await apiGet(`/int/api/properties/${id}/sources`, { goalId, range, from, to })),
);

server.tool(
  "campaigns",
  "UTM attribution for a property, grouped by a UTM dimension, with conversionRate (0..1). Pass goalId to attribute a specific goal.",
  {
    id: propId,
    groupBy: z
      .enum(["source", "medium", "campaign", "term", "content"])
      .optional()
      .describe("UTM dimension to group by. Defaults to source."),
    goalId: z.string().optional().describe("Restrict conversions to this goal id."),
    ...rangeShape,
  },
  async ({ id, groupBy, goalId, range, from, to }) =>
    ok(await apiGet(`/int/api/properties/${id}/campaigns`, { groupBy, goalId, range, from, to })),
);

server.tool(
  "list_goals",
  "List the conversion goals defined for a property (url-pattern or custom-event goals).",
  { id: propId },
  async ({ id }) => ok(await apiGet(`/int/api/properties/${id}/goals`)),
);

server.tool(
  "list_visitors",
  "List recent visitors for a property (sorted by last seen) with first/last seen, country, first referrer, first UTM, and session count.",
  { id: propId, limit: z.number().int().positive().optional().describe("Max rows (default 50)."), ...rangeShape },
  async ({ id, limit, range, from, to }) =>
    ok(await apiGet(`/int/api/properties/${id}/visitors`, { limit, range, from, to })),
);

server.tool(
  "visitor_timeline",
  "Full session-and-event timeline for one visitor: every session, its entry/exit URLs, UTM, goals hit, and each event (including custom-event props).",
  { id: propId, visitorId: z.string().describe("Visitor id from list_visitors.") },
  async ({ id, visitorId }) =>
    ok(await apiGet(`/int/api/properties/${id}/visitors/${visitorId}/timeline`)),
);

// Writes -------------------------------------------------------------------
// Require an admin/root account (viewer cannot write). Before creating, call
// list_goals to avoid duplicates. Deletes are intentionally not exposed.

server.tool(
  "create_goal",
  "Create a conversion goal on a property. kind=url: pattern is an RE2 regex matched (unanchored) against the event path, which INCLUDES the query string — anchor with ^ for a prefix. kind=event: pattern is the exact custom-event name fired via window.pager(name). Call list_goals first to avoid duplicates.",
  {
    id: propId,
    name: z.string().min(1).describe("Human-readable goal name."),
    kind: z.enum(["url", "event"]).describe("'url' (regex on path) or 'event' (exact event name)."),
    pattern: z
      .string()
      .min(1)
      .describe("For url: an RE2 regex (e.g. ^/order/paid(\\?|$)). For event: the exact event name (e.g. signup_completed)."),
  },
  async ({ id, name, kind, pattern }) =>
    ok(await apiSend("POST", `/int/api/properties/${id}/goals`, { name, kind, pattern })),
);

server.tool(
  "update_goal",
  "Update a goal's name and/or pattern. The goal's kind is immutable — a new pattern is re-validated against the existing kind (url patterns must be valid RE2). Pattern changes only affect FUTURE ingest matching; historical conversions are not recomputed. Provide at least one of name/pattern.",
  {
    goalId: z.string().describe("Goal id (from list_goals)."),
    name: z.string().min(1).optional().describe("New name."),
    pattern: z.string().min(1).optional().describe("New pattern (validated against the goal's existing kind)."),
  },
  async ({ goalId, name, pattern }) => {
    if (name === undefined && pattern === undefined) {
      throw new Error("update_goal requires at least one of name or pattern");
    }
    const body: Record<string, string> = {};
    if (name !== undefined) body.name = name;
    if (pattern !== undefined) body.pattern = pattern;
    return ok(await apiSend("PATCH", `/int/api/goals/${goalId}`, body));
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[pager-insights] MCP server ready");
