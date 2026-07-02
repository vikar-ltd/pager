"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, type Goal, type Timeline, type TimelineSession } from "@/lib/api";

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

  if (!data) return <div className="eyebrow">loading…</div>;

  return (
    <div className="space-y-10">
      <header>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <div className="eyebrow">Visitor</div>
            <div className="mt-2 font-serif text-3xl italic tracking-tight break-all">{vid}</div>
          </div>
          <Link
            href={`/properties/${id}/visitors`}
            className="font-mono text-[10px] uppercase tracking-eyebrow text-muted-foreground hover:text-foreground transition-colors"
          >
            ← All visitors
          </Link>
        </div>
      </header>

      {data.sessions.length === 0 ? (
        <p className="rule-top pt-8 font-serif text-2xl italic text-muted-foreground">
          No sessions to show.
        </p>
      ) : (
        <div className="space-y-14">
          {data.sessions.map((s, i) => (
            <SessionBlock
              key={s.id}
              session={s}
              index={data.sessions.length - i}
              goalsByID={goalsByID}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SessionBlock({
  session,
  index,
  goalsByID,
}: {
  session: TimelineSession;
  index: number;
  goalsByID: Record<string, Goal>;
}) {
  let entryPath = "/";
  try { entryPath = new URL(session.entryUrl).pathname; } catch {}
  let refHost: string | null = null;
  try { refHost = session.firstReferrer ? new URL(session.firstReferrer).hostname : null; } catch {}

  return (
    <section className="rule-top pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <div className="eyebrow">Session {String(index).padStart(2, "0")}</div>
          <div className="mt-2 font-serif text-2xl leading-tight">
            <span className="italic">{new Date(session.startedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</span>
          </div>
        </div>
        {(session.goalsHit ?? []).length > 0 && (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            {(session.goalsHit ?? []).map((gid) => (
              <span key={gid} className="font-mono text-[10px] uppercase tracking-eyebrow text-moss">
                ✓ {goalsByID[gid]?.name ?? gid.slice(0, 8)}
              </span>
            ))}
          </div>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-xs">
        <dt className="font-mono uppercase tracking-eyebrow text-muted-foreground">Entry</dt>
        <dd className="font-mono text-foreground truncate">{entryPath}</dd>
        {session.utm?.source && (
          <>
            <dt className="font-mono uppercase tracking-eyebrow text-muted-foreground">UTM</dt>
            <dd className="font-mono text-foreground">
              {session.utm.source}
              {session.utm.campaign ? " / " + session.utm.campaign : ""}
            </dd>
          </>
        )}
        {refHost && (
          <>
            <dt className="font-mono uppercase tracking-eyebrow text-muted-foreground">From</dt>
            <dd className="font-mono text-foreground">{refHost}</dd>
          </>
        )}
      </dl>

      <ol className="mt-6 relative border-l border-rule pl-6 space-y-3">
        {session.events.map((e) => (
          <li key={e.id} className="relative">
            <span className="absolute -left-[calc(1.5rem+3.5px)] top-2 w-1.5 h-1.5 rounded-full bg-foreground" />
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="font-mono text-[10px] uppercase tracking-eyebrow tabular-nums w-16 shrink-0 text-muted-foreground">
                {new Date(e.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
              <span className={
                "font-mono text-[10px] uppercase tracking-eyebrow " +
                (e.type === "event" ? "text-moss" : "text-muted-foreground")
              }>
                {e.type}
              </span>
              <span className="font-mono text-sm text-foreground break-all">
                {e.type === "event" ? e.name : e.path}
              </span>
            </div>
            {e.props && (
              <pre className="mt-1 ml-[4.75rem] text-[11px] text-muted-foreground bg-accent/40 px-2 py-1 rounded-sm inline-block font-mono">
                {JSON.stringify(e.props)}
              </pre>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
