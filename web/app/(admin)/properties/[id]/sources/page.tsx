"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, type SourcesResponse, type RangeKey } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RangePicker } from "@/components/range-picker";

export default function SourcesPage() {
  const { id } = useParams<{ id: string }>();
  const [range, setRange] = useState<RangeKey>("7d");
  const [data, setData] = useState<SourcesResponse | null>(null);

  useEffect(() => {
    setData(null);
    api.get<SourcesResponse>(`/properties/${id}/sources?range=${range}`).then(setData).catch(() => {});
  }, [id, range]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Referrer sources</h2>
        <RangePicker value={range} onChange={setRange} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>By referrer host</CardTitle>
        </CardHeader>
        <CardContent>
          {!data ? (
            <div className="h-24 grid place-items-center text-xs text-muted-foreground">Loading…</div>
          ) : data.rows.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">No traffic in this window.</div>
          ) : (
            <SourcesTable rows={data.rows} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SourcesTable({
  rows,
}: {
  rows: { host: string; sessions: number; visitors: number; conversions: number; conversionRate: number }[];
}) {
  const max = Math.max(...rows.map((r) => r.sessions), 1);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Host</TableHead>
          <TableHead className="text-right">Visitors</TableHead>
          <TableHead className="text-right">Sessions</TableHead>
          <TableHead className="text-right">Conv.</TableHead>
          <TableHead className="text-right">Rate</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.host || "(direct)"}>
            <TableCell className="font-medium">
              <div className="relative">
                <div
                  className="absolute inset-y-0 left-0 -mx-2 rounded-sm bg-accent/50"
                  style={{ width: `${(r.sessions / max) * 100}%` }}
                />
                <span className="relative">{r.host || <span className="text-muted-foreground">(direct)</span>}</span>
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
