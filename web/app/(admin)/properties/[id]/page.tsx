"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { api, type Overview, type RangeKey } from "@/lib/api";
import { RangePicker } from "@/components/range-picker";
import { Section } from "@/components/section";

const TimeseriesChart = dynamic(() => import("@/components/overview-chart").then((m) => m.TimeseriesChart), {
  ssr: false,
  loading: () => <div className="h-64 grid place-items-end pb-4"><span className="eyebrow">loading chart…</span></div>,
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
    <div className="space-y-12">
      {/* Four peer stats, all set at the same size — no one number wins */}
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div className="eyebrow">Overview · last {rangeLabel(range)}</div>
          <RangePicker value={range} onChange={setRange} />
        </div>
        <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-8">
          <Stat label="Pageviews" value={data?.totals.pageviews} />
          <Stat label="Visitors"  value={data?.totals.visitors} />
          <Stat label="Sessions"  value={data?.totals.sessions} />
          <Stat label="Events"    value={data?.totals.events} />
        </div>
      </section>

      <Section
        label="Activity"
        aside={data && (
          <span className="font-mono text-[10px] uppercase tracking-eyebrow text-muted-foreground">
            by {data.range.unit}
          </span>
        )}
      >
        <div className="pt-2">
          {data ? <TimeseriesChart data={data.timeseries} unit={data.range.unit} /> : <div className="h-64" />}
        </div>
        <div className="mt-4 flex items-center gap-6 text-xs text-muted-foreground">
          <ChartLegend swatchClass="bg-moss" label="Pageviews" />
          <ChartLegend swatchClass="border border-foreground border-dashed" label="Visitors" hollow />
        </div>
      </Section>

      {empty && (
        <div className="rule-top pt-8">
          <p className="font-serif text-3xl italic text-muted-foreground max-w-lg leading-snug">
            No traffic in this window yet.
          </p>
          <Link
            href={`/properties/${id}/settings`}
            className="mt-4 inline-block font-mono text-[11px] uppercase tracking-eyebrow text-foreground underline underline-offset-4 decoration-moss decoration-2"
          >
            View install snippet
          </Link>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value?: number }) {
  return (
    <div>
      <div className="eyebrow">{label}</div>
      <div className="mt-2 stat-num-sm">
        {value !== undefined ? value.toLocaleString() : <span className="text-muted-foreground/40">—</span>}
      </div>
    </div>
  );
}

function ChartLegend({ swatchClass, label, hollow }: { swatchClass: string; label: string; hollow?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`inline-block w-3 h-3 ${hollow ? "" : "rounded-sm"} ${swatchClass}`} />
      <span className="font-mono text-[10px] uppercase tracking-eyebrow">{label}</span>
    </span>
  );
}

function rangeLabel(r: RangeKey) {
  return { "24h": "24 hours", "7d": "7 days", "30d": "30 days", "90d": "90 days" }[r];
}
