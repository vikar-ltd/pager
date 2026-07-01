"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, type CampaignsResponse, type RangeKey } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RangePicker } from "@/components/range-picker";
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
  const [data, setData] = useState<CampaignsResponse | null>(null);

  useEffect(() => {
    setData(null);
    api
      .get<CampaignsResponse>(`/properties/${id}/campaigns?range=${range}&groupBy=${groupBy}`)
      .then(setData)
      .catch(() => {});
  }, [id, range, groupBy]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Campaigns</h2>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center rounded-md border bg-card p-0.5 text-xs">
            {GROUPS.map((g) => (
              <button
                key={g.value}
                onClick={() => setGroupBy(g.value)}
                className={cn(
                  "rounded px-2.5 py-1 font-medium transition-colors",
                  groupBy === g.value
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {g.label}
              </button>
            ))}
          </div>
          <RangePicker value={range} onChange={setRange} />
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>By utm_{groupBy}</CardTitle>
        </CardHeader>
        <CardContent>
          {!data ? (
            <div className="h-24 grid place-items-center text-xs text-muted-foreground">Loading…</div>
          ) : data.rows.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">No traffic in this window.</div>
          ) : (
            <RowsTable rows={data.rows} keyHeader={`utm_${groupBy}`} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RowsTable({
  rows,
  keyHeader,
}: {
  rows: { key: string; sessions: number; visitors: number; conversions: number; conversionRate: number }[];
  keyHeader: string;
}) {
  const max = Math.max(...rows.map((r) => r.sessions), 1);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{keyHeader}</TableHead>
          <TableHead className="text-right">Visitors</TableHead>
          <TableHead className="text-right">Sessions</TableHead>
          <TableHead className="text-right">Conv.</TableHead>
          <TableHead className="text-right">Rate</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.key || "(none)"}>
            <TableCell className="font-medium">
              <div className="relative">
                <div
                  className="absolute inset-y-0 left-0 -mx-2 rounded-sm bg-accent/50"
                  style={{ width: `${(r.sessions / max) * 100}%` }}
                />
                <span className="relative">{r.key || <span className="text-muted-foreground">(direct / no utm)</span>}</span>
              </div>
            </TableCell>
            <TableCell className="text-right tabular-nums">{r.visitors.toLocaleString()}</TableCell>
            <TableCell className="text-right tabular-nums">{r.sessions.toLocaleString()}</TableCell>
            <TableCell className="text-right tabular-nums">{r.conversions.toLocaleString()}</TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground">
              {(r.conversionRate * 100).toFixed(1)}%
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
