"use client";

import type { Goal } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Inline goal filter. Renders as a bare <select> styled to match the
 * eyebrow language elsewhere. The empty value (`""`) means "all goals".
 */
export function GoalPicker({
  goals,
  value,
  onChange,
  className,
}: {
  goals: Goal[];
  value: string; // "" for all
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <label className={cn("inline-flex items-baseline gap-2 text-xs", className)}>
      <span className="font-mono text-[10px] uppercase tracking-eyebrow text-muted-foreground">Goal</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "bg-transparent border-b border-transparent hover:border-input focus:border-foreground",
          "font-mono text-xs py-0.5 pr-4 focus:outline-none cursor-pointer",
          value ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <option value="">All goals</option>
        {goals.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
    </label>
  );
}
