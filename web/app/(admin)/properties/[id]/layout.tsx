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
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="text-xs text-muted-foreground">
          <Link href="/properties" className="hover:underline">
            Properties
          </Link>{" "}
          / <span className="font-mono">{property?.siteId ?? "…"}</span>
        </div>
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{property?.name ?? "…"}</h1>
          <span className="text-sm text-muted-foreground">{property?.domain || ""}</span>
        </div>
      </div>

      <nav className="border-b">
        <ul className="flex gap-1">
          {TABS.map((t) => {
            const href = t.slug ? `${base}/${t.slug}` : base;
            const active =
              t.slug === ""
                ? pathname === base
                : pathname === href || pathname.startsWith(href + "/");
            return (
              <li key={t.slug}>
                <Link
                  href={href}
                  className={cn(
                    "inline-flex items-center px-3 py-2 text-sm border-b-2 -mb-px transition-colors",
                    active
                      ? "border-foreground text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t.label}
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
