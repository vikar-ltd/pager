"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Property } from "@/lib/api";
import { Section } from "@/components/section";

export default function DashboardPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    api.get<Property[]>("/properties")
      .then(setProperties)
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  return (
    <div className="space-y-14">
      <header className="max-w-2xl">
        <div className="eyebrow">Dashboard</div>
        <h1 className="mt-3 font-serif text-5xl md:text-6xl leading-[1.05] tracking-tight">
          Your sites, <em className="italic">at a glance</em>.
        </h1>
        <p className="mt-4 text-muted-foreground text-[15px] leading-relaxed">
          Pick a property to see the story of who's visiting, where they came from,
          and what they did once they arrived.
        </p>
      </header>

      <Section
        label={`Properties · ${properties.length}`}
        aside={
          <Link
            href="/properties"
            className="font-mono text-[10px] uppercase tracking-eyebrow text-muted-foreground hover:text-foreground transition-colors"
          >
            Add new ↗
          </Link>
        }
      >
        {!loaded ? (
          <div className="eyebrow py-6">loading…</div>
        ) : properties.length === 0 ? (
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
            {properties.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/properties/${p.id}`}
                  className="group flex items-baseline justify-between gap-4 py-4 transition-colors hover:text-foreground"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-lg text-foreground group-hover:underline underline-offset-4 decoration-moss decoration-2 truncate">
                      {p.name}
                    </div>
                    {p.domain && (
                      <div className="mt-0.5 text-sm text-muted-foreground truncate">{p.domain}</div>
                    )}
                  </div>
                  <div className="font-mono text-xs text-muted-foreground shrink-0 tabular-nums">
                    {p.siteId}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
