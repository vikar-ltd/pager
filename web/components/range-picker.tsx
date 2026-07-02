"use client";

import { cn } from "@/lib/utils";
import type { RangeKey } from "@/lib/api";

const OPTIONS: { value: RangeKey; label: string }[] = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
];

/**
 * Inline text range picker. No enclosing frame — just four labels separated
 * by hair-thin marks, the active one anchored in ink.
 */
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
    <div className={cn("inline-flex items-baseline gap-3 text-xs", className)}>
      {OPTIONS.map((o, i) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "font-mono tabular-nums transition-colors focus:outline-none",
            "underline-offset-[6px]",
            value === o.value
              ? "text-foreground underline decoration-moss decoration-2"
              : "text-muted-foreground hover:text-foreground",
          )}
          style={{ marginLeft: i === 0 ? 0 : undefined }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
