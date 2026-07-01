// Thin fetch wrapper around the same-origin /int/api/* endpoints. All requests
// rely on the pgr_admin cookie; on 401 we throw an ApiError so callers can
// decide whether to redirect (the auth gate in (admin)/layout does).

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`/int/api${path}`, {
    ...init,
    headers,
    credentials: "same-origin",
  });
  if (res.status === 204) {
    return undefined as T;
  }
  const contentType = res.headers.get("Content-Type") || "";
  const body = contentType.includes("json") ? await res.json() : await res.text();
  if (!res.ok) {
    const code = typeof body === "object" && body?.code ? body.code : "error";
    const msg = typeof body === "object" && body?.message ? body.message : res.statusText;
    throw new ApiError(res.status, code, msg);
  }
  return body as T;
}

export const api = {
  get:  <T,>(p: string) => request<T>(p),
  post: <T,>(p: string, b?: unknown) => request<T>(p, { method: "POST", body: b != null ? JSON.stringify(b) : undefined }),
  patch:<T,>(p: string, b?: unknown) => request<T>(p, { method: "PATCH", body: b != null ? JSON.stringify(b) : undefined }),
  del:  <T,>(p: string) => request<T>(p, { method: "DELETE" }),
};

// ---- types mirrored from the Go API
export interface Property {
  id: string;
  name: string;
  domain: string;
  siteId: string;
  createdAt: string;
}

export interface Goal {
  id: string;
  propertyId: string;
  name: string;
  kind: "url" | "event";
  pattern: string;
  createdAt: string;
}

export interface AdminSession {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  ip: string;
  country: string;
  ua: { browser: string; os: string; device: string; raw: string };
  current: boolean;
  revokedAt?: string;
}

export interface Me {
  username: string;
  session: AdminSession;
}

// ---- reports
export type RangeKey = "24h" | "7d" | "30d" | "90d";

export interface ReportRange {
  from: string;
  to: string;
  unit: "hour" | "day";
}

export interface OverviewBucket {
  t: string;
  visitors: number;
  sessions: number;
  pageviews: number;
}

export interface Overview {
  range: ReportRange;
  totals: { visitors: number; sessions: number; pageviews: number; events: number };
  timeseries: OverviewBucket[];
}

export interface CampaignRow {
  key: string;
  sessions: number;
  visitors: number;
  conversions: number;
  conversionRate: number;
}

export interface CampaignsResponse {
  range: ReportRange;
  groupBy: "source" | "medium" | "campaign";
  rows: CampaignRow[];
}

export interface SourceRow {
  host: string;
  sessions: number;
  visitors: number;
  conversions: number;
  conversionRate: number;
}

export interface SourcesResponse {
  range: ReportRange;
  rows: SourceRow[];
}

export interface VisitorRow {
  id: string;
  firstSeen: string;
  lastSeen: string;
  country: string;
  firstReferrer: string;
  firstUtm?: { source?: string; medium?: string; campaign?: string };
  sessions: number;
}

export interface VisitorsResponse {
  range: ReportRange;
  rows: VisitorRow[];
}

export interface TimelineEvent {
  id: string;
  type: "pageview" | "event";
  name?: string;
  url: string;
  path: string;
  ref?: string;
  ts: string;
  props?: Record<string, unknown>;
}

export interface TimelineSession {
  id: string;
  startedAt: string;
  lastSeen: string;
  entryUrl: string;
  exitUrl: string;
  utm?: Record<string, string>;
  country: string;
  firstReferrer: string;
  goalsHit?: string[];
  events: TimelineEvent[];
}

export interface Timeline {
  visitorId: string;
  sessions: TimelineSession[];
}
