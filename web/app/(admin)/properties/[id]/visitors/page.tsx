"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, type VisitorsResponse, type RangeKey } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RangePicker } from "@/components/range-picker";

export default function VisitorsPage() {
  const { id } = useParams<{ id: string }>();
  const [range, setRange] = useState<RangeKey>("7d");
  const [data, setData] = useState<VisitorsResponse | null>(null);

  useEffect(() => {
    setData(null);
    api.get<VisitorsResponse>(`/properties/${id}/visitors?range=${range}`).then(setData).catch(() => {});
  }, [id, range]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Visitors</h2>
        <RangePicker value={range} onChange={setRange} />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Recent visitors</CardTitle>
        </CardHeader>
        <CardContent>
          {!data ? (
            <div className="h-24 grid place-items-center text-xs text-muted-foreground">Loading…</div>
          ) : data.rows.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">No visitors in this window.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Visitor</TableHead>
                  <TableHead>First UTM</TableHead>
                  <TableHead>Referrer</TableHead>
                  <TableHead className="text-right">Sessions</TableHead>
                  <TableHead className="text-right">Last seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.rows.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell>
                      <Link
                        href={`/properties/${id}/visitors/${v.id}`}
                        className="font-mono text-xs hover:underline"
                      >
                        {v.id.slice(0, 10)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {v.firstUtm?.source ? (
                        <span>
                          {v.firstUtm.source}
                          {v.firstUtm.campaign ? ` / ${v.firstUtm.campaign}` : ""}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground truncate max-w-[18rem]">
                      {v.firstReferrer || "(direct)"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{v.sessions}</TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {new Date(v.lastSeen).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
