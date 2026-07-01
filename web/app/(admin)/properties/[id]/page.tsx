"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { api, type Overview, type RangeKey } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RangePicker } from "@/components/range-picker";

const TimeseriesChart = dynamic(() => import("@/components/overview-chart").then((m) => m.TimeseriesChart), {
  ssr: false,
  loading: () => <div className="h-64 grid place-items-center text-xs text-muted-foreground">Loading chart…</div>,
});

export default function OverviewPage() {
  const { id } = useParams<{ id: string }>();
  const [range, setRange] = useState<RangeKey>("7d");
  const [data, setData] = useState<Overview | null>(null);

  useEffect(() => {
    setData(null);
    api.get<Overview>(`/properties/${id}/overview?range=${range}`).then(setData).catch(() => {});
  }, [id, range]);

  const empty = data && data.totals.visitors === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Overview</h2>
        </div>
        <RangePicker value={range} onChange={setRange} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Visitors" value={data?.totals.visitors} />
        <Stat label="Sessions" value={data?.totals.sessions} />
        <Stat label="Pageviews" value={data?.totals.pageviews} />
        <Stat label="Events" value={data?.totals.events} />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle>Activity</CardTitle>
          {data && <span className="text-xs text-muted-foreground">bucket: {data.range.unit}</span>}
        </CardHeader>
        <CardContent>
          {data ? <TimeseriesChart data={data.timeseries} unit={data.range.unit} /> : <div className="h-64" />}
        </CardContent>
      </Card>

      {empty && (
        <Card>
          <CardHeader>
            <CardTitle>No data in this window</CardTitle>
            <CardDescription>
              Once the snippet is on a tracked page, events appear here within seconds. The Settings tab has copy-pasteable
              installation instructions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild size="sm" variant="outline">
              <Link href={`/properties/${id}/settings`}>View install snippet</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value?.toLocaleString() ?? "—"}</div>
    </div>
  );
}
