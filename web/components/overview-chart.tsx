"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { OverviewBucket } from "@/lib/api";

function fmt(t: string, unit: "hour" | "day") {
  const d = new Date(t);
  if (unit === "hour") {
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

/**
 * A quieter chart. No gridlines, no framed tooltip — just a soft moss fill
 * for pageviews and a hair-thin ink line for visitors. Made to sit under the
 * big number without competing with it.
 */
export function TimeseriesChart({ data, unit }: { data: OverviewBucket[]; unit: "hour" | "day" }) {
  return (
    <div className="h-64 -ml-2">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="pv-moss" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--moss))" stopOpacity={0.28} />
              <stop offset="100%" stopColor="hsl(var(--moss))" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="t"
            tickFormatter={(t) => fmt(t, unit)}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", fontFamily: "var(--font-mono)" }}
            axisLine={false}
            tickLine={false}
            tickMargin={10}
            minTickGap={40}
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))", fontFamily: "var(--font-mono)" }}
            axisLine={false}
            tickLine={false}
            tickMargin={8}
            width={32}
          />
          <Tooltip
            cursor={{ stroke: "hsl(var(--moss))", strokeWidth: 1 }}
            contentStyle={{
              background: "hsl(var(--background))",
              border: "1px solid hsl(var(--rule))",
              borderRadius: 4,
              fontSize: 12,
              fontFamily: "var(--font-sans)",
              boxShadow: "0 4px 20px hsl(var(--foreground) / 0.06)",
              padding: "8px 10px",
            }}
            labelStyle={{ fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", color: "hsl(var(--muted-foreground))", marginBottom: 4 }}
            itemStyle={{ padding: 0 }}
            labelFormatter={(t) => fmt(String(t), unit)}
          />
          <Area
            type="monotone"
            dataKey="pageviews"
            name="pageviews"
            stroke="hsl(var(--moss))"
            strokeWidth={2}
            fill="url(#pv-moss)"
            dot={false}
          />
          <Area
            type="monotone"
            dataKey="visitors"
            name="visitors"
            stroke="hsl(var(--foreground))"
            strokeWidth={1}
            strokeDasharray="3 4"
            fill="transparent"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
