"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { api, type Property } from "@/lib/api";
import { cn } from "@/lib/utils";

const TABS = [
  { slug: "", label: "Overview" },
  { slug: "campaigns", label: "Campaigns" },
  { slug: "sources", label: "Sources" },
  { slug: "visitors", label: "Visitors" },
  { slug: "goals", label: "Goals" },
  { slug: "settings", label: "Settings" },
] as const;

export default function PropertyLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const [property, setProperty] = useState<Property | null>(null);

  useEffect(() => {
    api.get<Property>(`/properties/${id}`).then(setProperty).catch(() => {});
  }, [id]);

  const base = `/properties/${id}`;

  return (
    <div className="space-y-10">
      <header>
        <div className="flex items-baseline gap-3 flex-wrap">
          <Link
            href="/properties"
            className="font-mono text-[10px] uppercase tracking-eyebrow text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Properties
          </Link>
          {property?.siteId && (
            <span className="font-mono text-[10px] uppercase tracking-eyebrow text-muted-foreground">
              site {property.siteId}
            </span>
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <h1 className="font-serif text-4xl md:text-5xl leading-none tracking-tight break-all">
            {property?.name ?? "…"}
          </h1>
          {property?.domain && (
            <span className="font-mono text-sm text-muted-foreground break-all">{property.domain}</span>
          )}
        </div>
      </header>

      <nav className="-mx-5 md:mx-0">
        <ul className="flex gap-6 md:gap-8 overflow-x-auto overflow-y-hidden px-5 md:px-0 border-b border-rule">
          {TABS.map((t) => {
            const href = t.slug ? `${base}/${t.slug}` : base;
            const active = t.slug === "" ? pathname === base : pathname === href || pathname.startsWith(href + "/");
            return (
              <li key={t.slug} className="shrink-0">
                <Link
                  href={href}
                  className={cn(
                    "inline-block whitespace-nowrap py-3 text-sm transition-colors relative",
                    active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.label}
                  {active && (
                    <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-moss" />
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div>{children}</div>
    </div>
  );
}
