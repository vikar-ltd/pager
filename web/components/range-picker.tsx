"use client";

import { cn } from "@/lib/utils";
import type { RangeKey } from "@/lib/api";

const OPTIONS: { value: RangeKey; label: string }[] = [
  { value: "24h", label: "24 h" },
  { value: "7d", label: "7 d" },
  { value: "30d", label: "30 d" },
  { value: "90d", label: "90 d" },
];

export function RangePicker({
  value,
  onChange,
  className,
}: {
  value: RangeKey;
  onChange: (v: RangeKey) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex items-center rounded-md border bg-card p-0.5 text-xs", className)}>
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded px-2.5 py-1 font-medium transition-colors",
            value === o.value
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
