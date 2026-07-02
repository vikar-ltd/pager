"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, type Goal, type SourcesResponse, type RangeKey } from "@/lib/api";
import { RangePicker } from "@/components/range-picker";
import { GoalPicker } from "@/components/goal-picker";
import { Section } from "@/components/section";

export default function SourcesPage() {
  const { id } = useParams<{ id: string }>();
  const [range, setRange] = useState<RangeKey>("7d");
  const [goalId, setGoalId] = useState<string>("");
  const [goals, setGoals] = useState<Goal[]>([]);
  const [data, setData] = useState<SourcesResponse | null>(null);

  useEffect(() => {
    api.get<Goal[]>(`/properties/${id}/goals`).then(setGoals).catch(() => {});
  }, [id]);

  useEffect(() => {
    setData(null);
    const qs = new URLSearchParams({ range });
    if (goalId) qs.set("goalId", goalId);
    api.get<SourcesResponse>(`/properties/${id}/sources?${qs}`).then(setData).catch(() => {});
  }, [id, range, goalId]);

  const selectedGoal = goals.find((g) => g.id === goalId);

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <p className="text-sm text-muted-foreground max-w-lg">
          The domains that referred traffic to this property, ranked by session count.
        </p>
        <div className="flex items-baseline gap-6 flex-wrap">
          {goals.length > 0 && <GoalPicker goals={goals} value={goalId} onChange={setGoalId} />}
          <RangePicker value={range} onChange={setRange} />
        </div>
      </div>

      <Section
        label={
          selectedGoal
            ? `Referrer hosts · conversions for "${selectedGoal.name}"`
            : "Referrer hosts"
        }
      >
        {!data ? (
          <div className="eyebrow py-6">loading…</div>
        ) : data.rows.length === 0 ? (
          <p className="py-6 font-serif text-2xl italic text-muted-foreground">
            No referrals in this window.
          </p>
        ) : (
          <RankedList rows={data.rows} />
        )}
      </Section>
    </div>
  );
}

function RankedList({
  rows,
}: {
  rows: { host: string; sessions: number; visitors: number; conversions: number; conversionRate: number }[];
}) {
  const max = Math.max(...rows.map((r) => r.sessions), 1);
  return (
    <div>
      <div className="hidden sm:grid grid-cols-[1fr_5rem_5rem_5rem] gap-4 pb-3 border-b border-rule">
        <div className="font-mono text-[10px] uppercase tracking-eyebrow text-muted-foreground">Host</div>
        <div className="font-mono text-[10px] uppercase tracking-eyebrow text-muted-foreground text-right">Visitors</div>
        <div className="font-mono text-[10px] uppercase tracking-eyebrow text-muted-foreground text-right">Sessions</div>
        <div className="font-mono text-[10px] uppercase tracking-eyebrow text-muted-foreground text-right">Conv.</div>
      </div>
      <ul className="row-divide">
        {rows.map((r) => (
          <li key={r.host || "(direct)"} className="sm:grid sm:grid-cols-[1fr_5rem_5rem_5rem] sm:gap-4 sm:items-center py-3">
            <div className="relative pr-2 min-w-0">
              <div
                className="absolute inset-y-0 left-0 -mx-1 rounded-sm bg-moss/12"
                style={{ width: `${(r.sessions / max) * 100}%` }}
                aria-hidden
              />
              <div className="relative truncate text-sm">
                {r.host || <span className="italic text-muted-foreground">(direct)</span>}
              </div>
              <div className="mt-2 sm:hidden flex items-baseline gap-4 relative font-mono text-[11px] tabular-nums text-muted-foreground">
                <span>{r.visitors.toLocaleString()} visitors</span>
                <span>{r.sessions.toLocaleString()} sessions</span>
                <span>{(r.conversionRate * 100).toFixed(1)}%</span>
              </div>
            </div>
            <div className="hidden sm:block text-right font-mono text-sm tabular-nums">{r.visitors.toLocaleString()}</div>
            <div className="hidden sm:block text-right font-mono text-sm tabular-nums">{r.sessions.toLocaleString()}</div>
            <div className="hidden sm:block text-right font-mono text-sm tabular-nums">
              <span className={r.conversions > 0 ? "text-foreground" : "text-muted-foreground"}>
                {r.conversions}
              </span>
              <span className="text-muted-foreground"> · {(r.conversionRate * 100).toFixed(0)}%</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
