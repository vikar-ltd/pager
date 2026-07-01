"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, type Goal, type Timeline } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function VisitorTimelinePage() {
  const { id, vid } = useParams<{ id: string; vid: string }>();
  const [data, setData] = useState<Timeline | null>(null);
  const [goalsByID, setGoalsByID] = useState<Record<string, Goal>>({});

  useEffect(() => {
    api.get<Timeline>(`/properties/${id}/visitors/${vid}/timeline`).then(setData).catch(() => {});
    api
      .get<Goal[]>(`/properties/${id}/goals`)
      .then((gs) => setGoalsByID(Object.fromEntries(gs.map((g) => [g.id, g]))))
      .catch(() => {});
  }, [id, vid]);

  if (!data) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Visitor timeline</h2>
          <div className="mt-1 text-sm font-mono">{vid}</div>
        </div>
        <Link href={`/properties/${id}/visitors`} className="text-xs text-muted-foreground hover:underline">
          ← all visitors
        </Link>
      </div>

      {data.sessions.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">No sessions for this visitor.</CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {data.sessions.map((s, i) => (
            <Card key={s.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle>
                    Session #{data.sessions.length - i}
                    <span className="ml-2 text-xs text-muted-foreground font-mono font-normal">{s.id.slice(0, 10)}</span>
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {(s.goalsHit ?? []).map((gid) => (
                      <Badge key={gid} variant="default">
                        ✓ {goalsByID[gid]?.name ?? gid.slice(0, 8)}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  Started {new Date(s.startedAt).toLocaleString()} · entry{" "}
                  <span className="font-mono">{new URL(s.entryUrl).pathname}</span>
                  {s.utm?.source ? (
                    <>
                      {" · utm "}
                      <span className="font-mono">
                        {s.utm.source}
                        {s.utm.campaign ? "/" + s.utm.campaign : ""}
                      </span>
                    </>
                  ) : null}
                  {s.firstReferrer ? (
                    <>
                      {" · ref "}
                      <span className="font-mono">{new URL(s.firstReferrer).hostname}</span>
                    </>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent>
                <ol className="relative border-l pl-4 ml-1 space-y-2">
                  {s.events.map((e) => (
                    <li key={e.id} className="text-sm">
                      <div className="absolute -left-[5px] mt-1.5 size-2 rounded-full bg-foreground" />
                      <div className="flex items-baseline gap-2">
                        <span className="text-xs text-muted-foreground tabular-nums w-20 shrink-0">
                          {new Date(e.ts).toLocaleTimeString()}
                        </span>
                        {e.type === "event" ? (
                          <Badge variant="secondary">event</Badge>
                        ) : (
                          <Badge variant="outline">pageview</Badge>
                        )}
                        <span className="font-mono text-xs">
                          {e.type === "event" ? e.name : e.path}
                        </span>
                      </div>
                      {e.props && (
                        <pre className="ml-22 mt-1 text-[10px] text-muted-foreground bg-muted/40 rounded px-2 py-1 inline-block">
                          {JSON.stringify(e.props)}
                        </pre>
                      )}
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
