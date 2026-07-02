"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, type CampaignsResponse, type Goal, type RangeKey } from "@/lib/api";
import { RangePicker } from "@/components/range-picker";
import { GoalPicker } from "@/components/goal-picker";
import { Section } from "@/components/section";
import { cn } from "@/lib/utils";

type GroupBy = "source" | "medium" | "campaign";
const GROUPS: { value: GroupBy; label: string }[] = [
  { value: "source", label: "Source" },
  { value: "medium", label: "Medium" },
  { value: "campaign", label: "Campaign" },
];

export default function CampaignsPage() {
  const { id } = useParams<{ id: string }>();
  const [range, setRange] = useState<RangeKey>("7d");
  const [groupBy, setGroupBy] = useState<GroupBy>("source");
  const [goalId, setGoalId] = useState<string>("");
  const [goals, setGoals] = useState<Goal[]>([]);
  const [data, setData] = useState<CampaignsResponse | null>(null);

  // Goals list is stable across range/groupBy changes — fetch once per property.
  useEffect(() => {
    api.get<Goal[]>(`/properties/${id}/goals`).then(setGoals).catch(() => {});
  }, [id]);

  useEffect(() => {
    setData(null);
    const qs = new URLSearchParams({ range, groupBy });
    if (goalId) qs.set("goalId", goalId);
    api
      .get<CampaignsResponse>(`/properties/${id}/campaigns?${qs}`)
      .then(setData)
      .catch(() => {});
  }, [id, range, groupBy, goalId]);

  const selectedGoal = goals.find((g) => g.id === goalId);

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div className="inline-flex items-baseline gap-4">
          {GROUPS.map((g) => (
            <button
              key={g.value}
              onClick={() => setGroupBy(g.value)}
              className={cn(
                "text-sm transition-colors focus:outline-none",
                "underline-offset-[6px]",
                groupBy === g.value
                  ? "text-foreground underline decoration-moss decoration-2"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {g.label}
            </button>
          ))}
        </div>
        <div className="flex items-baseline gap-6 flex-wrap">
          {goals.length > 0 && <GoalPicker goals={goals} value={goalId} onChange={setGoalId} />}
          <RangePicker value={range} onChange={setRange} />
        </div>
      </div>

      <Section
        label={
          selectedGoal
            ? `By utm_${groupBy} · conversions for "${selectedGoal.name}"`
            : `By utm_${groupBy}`
        }
      >
        {!data ? (
          <div className="eyebrow py-6">loading…</div>
        ) : data.rows.length === 0 ? (
          <p className="py-6 font-serif text-2xl italic text-muted-foreground">
            No traffic in this window.
          </p>
        ) : (
          <RankedList rows={data.rows} keyLabel={`utm_${groupBy}`} />
        )}
      </Section>
    </div>
  );
}

function RankedList({
  rows,
  keyLabel,
}: {
  rows: { key: string; sessions: number; visitors: number; conversions: number; conversionRate: number }[];
  keyLabel: string;
}) {
  const max = Math.max(...rows.map((r) => r.sessions), 1);
  return (
    <div>
      {/* Column labels */}
      <div className="hidden sm:grid grid-cols-[1fr_5rem_5rem_5rem] gap-4 pb-3 border-b border-rule">
        <div className="font-mono text-[10px] uppercase tracking-eyebrow text-muted-foreground">{keyLabel}</div>
        <div className="font-mono text-[10px] uppercase tracking-eyebrow text-muted-foreground text-right">Visitors</div>
        <div className="font-mono text-[10px] uppercase tracking-eyebrow text-muted-foreground text-right">Sessions</div>
        <div className="font-mono text-[10px] uppercase tracking-eyebrow text-muted-foreground text-right">Conv.</div>
      </div>
      <ul className="row-divide">
        {rows.map((r) => (
          <li key={r.key || "(none)"} className="sm:grid sm:grid-cols-[1fr_5rem_5rem_5rem] sm:gap-4 sm:items-center py-3">
            <div className="relative pr-2 min-w-0">
              <div
                className="absolute inset-y-0 left-0 -mx-1 rounded-sm bg-moss/12"
                style={{ width: `${(r.sessions / max) * 100}%` }}
                aria-hidden
              />
              <div className="relative truncate text-sm">
                {r.key || <span className="italic text-muted-foreground">(direct / no utm)</span>}
              </div>
              {/* Mobile-only stats sub-row */}
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
