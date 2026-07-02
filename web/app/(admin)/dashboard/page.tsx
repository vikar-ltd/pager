"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, type Overview, type Property, type RangeKey } from "@/lib/api";
import { Section } from "@/components/section";
import { Sparkline } from "@/components/sparkline";
import { RangePicker } from "@/components/range-picker";

type PropertyReport = { property: Property; overview: Overview | null };

const RANGE_LABEL: Record<RangeKey, string> = {
  "24h": "last 24 hours",
  "7d": "last 7 days",
  "30d": "last 30 days",
  "90d": "last 90 days",
};

export default function DashboardPage() {
  const [range, setRange] = useState<RangeKey>("7d");
  const [reports, setReports] = useState<PropertyReport[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setReports(null);
    (async () => {
      try {
        const props = await api.get<Property[]>("/properties");
        // Fetch overviews in parallel — self-hosted deployments have a handful
        // of properties, so this is cheap.
        const withOverviews = await Promise.all(
          props.map(async (p) => {
            try {
              const overview = await api.get<Overview>(`/properties/${p.id}/overview?range=${range}`);
              return { property: p, overview };
            } catch {
              return { property: p, overview: null };
            }
          }),
        );
        if (!cancelled) setReports(withOverviews);
      } catch {
        if (!cancelled) setReports([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [range]);

  // Aggregate totals across every property. Sum the totals directly — visitors
  // won't be perfectly deduplicated across properties (a person on two of your
  // sites counts twice), but that's the intended reading here: "traffic
  // passing through this instance of Pager".
  const totals = useMemo(() => {
    if (!reports) return null;
    return reports.reduce(
      (acc, r) => {
        const t = r.overview?.totals;
        if (!t) return acc;
        return {
          visitors: acc.visitors + t.visitors,
          sessions: acc.sessions + t.sessions,
          pageviews: acc.pageviews + t.pageviews,
          events: acc.events + t.events,
        };
      },
      { visitors: 0, sessions: 0, pageviews: 0, events: 0 },
    );
  }, [reports]);

  const propertyCount = reports?.length ?? 0;

  return (
    <div className="space-y-14">
      <header className="max-w-2xl">
        <div className="eyebrow">Dashboard</div>
        <h1 className="mt-3 font-serif text-5xl md:text-6xl leading-[1.05] tracking-tight">
          Your sites, <em className="italic">at a glance</em>.
        </h1>
        <p className="mt-4 text-muted-foreground text-[15px] leading-relaxed">
          A rolling summary across every property. Pick one to walk into its
          full story.
        </p>
      </header>

      {/* Aggregate totals block — mirrors the property overview page's stat row. */}
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <div className="eyebrow">Across all properties · {RANGE_LABEL[range]}</div>
          <RangePicker value={range} onChange={setRange} />
        </div>
        <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-8">
          <Stat label="Pageviews" value={totals?.pageviews} />
          <Stat label="Visitors"  value={totals?.visitors} />
          <Stat label="Sessions"  value={totals?.sessions} />
          <Stat label="Events"    value={totals?.events} />
        </div>
      </section>

      <Section
        label={reports === null ? "Properties" : `Properties · ${propertyCount}`}
        aside={
          <Link
            href="/properties"
            className="font-mono text-[10px] uppercase tracking-eyebrow text-muted-foreground hover:text-foreground transition-colors"
          >
            Add new ↗
          </Link>
        }
      >
        {reports === null ? (
          <div className="eyebrow py-6">loading…</div>
        ) : propertyCount === 0 ? (
          <div className="py-6">
            <p className="font-serif text-2xl italic text-muted-foreground">
              Nothing tracked yet.
            </p>
            <Link
              href="/properties"
              className="mt-3 inline-block font-mono text-[11px] uppercase tracking-eyebrow underline underline-offset-4 decoration-moss decoration-2"
            >
              Create your first property
            </Link>
          </div>
        ) : (
          <ul className="row-divide">
            {reports.map(({ property, overview }) => (
              <PropertyRow key={property.id} property={property} overview={overview} />
            ))}
          </ul>
        )}
      </Section>
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

function PropertyRow({ property, overview }: { property: Property; overview: Overview | null }) {
  const spark = (overview?.timeseries ?? []).map((b) => b.pageviews);
  const pageviews = overview?.totals.pageviews;
  const visitors = overview?.totals.visitors;

  return (
    <li>
      <Link
        href={`/properties/${property.id}`}
        className="group grid grid-cols-[1fr_auto] md:grid-cols-[1fr_auto_10rem] items-center gap-x-6 gap-y-1 py-5"
      >
        <div className="min-w-0">
          <div className="text-lg text-foreground group-hover:underline underline-offset-4 decoration-moss decoration-2 truncate">
            {property.name}
          </div>
          <div className="mt-0.5 text-sm text-muted-foreground truncate">
            {property.domain || <span className="italic text-muted-foreground/70">no domain</span>}
            <span className="font-mono text-xs ml-3 text-muted-foreground/70">{property.siteId}</span>
          </div>
        </div>

        <div className="col-span-2 md:col-span-1 md:col-start-3 order-3 md:order-none flex items-center justify-between md:justify-end gap-4">
          <div className="text-right">
            <div className="font-serif text-2xl leading-none tabular-nums">
              {pageviews !== undefined ? (
                pageviews.toLocaleString()
              ) : (
                <span className="text-muted-foreground/40">—</span>
              )}
            </div>
            <div className="mt-1 font-mono text-[10px] uppercase tracking-eyebrow text-muted-foreground">
              pv · {visitors ?? "—"} vis
            </div>
          </div>
        </div>

        <div className="col-start-2 md:col-start-2 order-2 md:order-none justify-self-end">
          <Sparkline data={spark} width={92} height={26} />
        </div>
      </Link>
    </li>
  );
}
