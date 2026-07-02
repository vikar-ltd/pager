"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, type VisitorsResponse, type RangeKey } from "@/lib/api";
import { RangePicker } from "@/components/range-picker";
import { Section } from "@/components/section";

export default function VisitorsPage() {
  const { id } = useParams<{ id: string }>();
  const [range, setRange] = useState<RangeKey>("7d");
  const [data, setData] = useState<VisitorsResponse | null>(null);

  useEffect(() => {
    setData(null);
    api.get<VisitorsResponse>(`/properties/${id}/visitors?range=${range}`).then(setData).catch(() => {});
  }, [id, range]);

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <p className="text-sm text-muted-foreground max-w-lg">
          Each person who's touched your site, most recent first. Click one to walk
          their session-by-session story.
        </p>
        <RangePicker value={range} onChange={setRange} />
      </div>

      <Section label={data ? `Recent visitors · ${data.rows.length}` : "Recent visitors"}>
        {!data ? (
          <div className="eyebrow py-6">loading…</div>
        ) : data.rows.length === 0 ? (
          <p className="py-6 font-serif text-2xl italic text-muted-foreground">
            Nobody yet.
          </p>
        ) : (
          <ul className="row-divide">
            {data.rows.map((v) => {
              const utm = v.firstUtm?.source
                ? v.firstUtm.source + (v.firstUtm.campaign ? " / " + v.firstUtm.campaign : "")
                : null;
              return (
                <li key={v.id}>
                  <Link
                    href={`/properties/${id}/visitors/${v.id}`}
                    className="group grid grid-cols-[1fr_auto] md:grid-cols-[10rem_1fr_auto] gap-x-6 gap-y-1 py-4 items-baseline"
                  >
                    <div className="font-mono text-xs text-foreground group-hover:underline underline-offset-4 decoration-moss decoration-2">
                      {v.id.slice(0, 10)}
                    </div>
                    <div className="col-span-2 md:col-span-1 min-w-0">
                      <div className="text-sm text-foreground truncate">
                        {utm ? (
                          <span>from <span className="font-mono">{utm}</span></span>
                        ) : v.firstReferrer ? (
                          <span>via <span className="font-mono text-muted-foreground">{new URL(v.firstReferrer).hostname}</span></span>
                        ) : (
                          <span className="italic text-muted-foreground">direct</span>
                        )}
                        <span className="text-muted-foreground"> · {v.sessions} session{v.sessions === 1 ? "" : "s"}</span>
                      </div>
                    </div>
                    <div className="font-mono text-[11px] uppercase tracking-eyebrow text-muted-foreground text-right shrink-0 col-start-2 md:col-start-3">
                      {timeAgo(v.lastSeen)}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const s = Math.max(0, Math.floor((now - then) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}
