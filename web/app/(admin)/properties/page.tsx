"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type Property } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Section } from "@/components/section";

export default function PropertiesPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setProperties(await api.get<Property[]>("/properties"));
  }
  useEffect(() => {
    refresh().catch(() => {});
  }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post<Property>("/properties", { name, domain });
      setName("");
      setDomain("");
      await refresh();
    } catch (e: any) {
      setError(e?.message || "Failed to create property");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-14">
      <header className="max-w-2xl">
        <div className="eyebrow">Properties</div>
        <h1 className="mt-3 font-serif text-5xl leading-[1.05] tracking-tight">
          A property per site.
        </h1>
        <p className="mt-4 text-muted-foreground text-[15px] leading-relaxed">
          Each one gets its own site ID for the snippet, its own goals, its own timeline.
        </p>
      </header>

      <Section label="Add a property">
        <form onSubmit={onCreate} className="grid gap-6 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Marketing site"
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="domain">Domain (optional)</Label>
            <Input
              id="domain"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="example.com"
              autoComplete="off"
            />
          </div>
          <Button type="submit" variant="moss" disabled={busy || !name.trim()}>
            {busy ? "Creating…" : "Create property"}
          </Button>
        </form>
        {error && <div className="mt-4 text-sm text-destructive">{error}</div>}
      </Section>

      <Section label={`All properties · ${properties.length}`}>
        {properties.length === 0 ? (
          <p className="py-6 font-serif text-2xl italic text-muted-foreground">
            None yet.
          </p>
        ) : (
          <ul className="row-divide">
            {properties.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/properties/${p.id}`}
                  className="group flex items-baseline gap-4 py-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-lg text-foreground group-hover:underline underline-offset-4 decoration-moss decoration-2 truncate">
                      {p.name}
                    </div>
                    <div className="mt-0.5 text-sm text-muted-foreground truncate">
                      {p.domain || <span className="italic text-muted-foreground/70">no domain</span>}
                    </div>
                  </div>
                  <div className="hidden sm:block font-mono text-xs text-muted-foreground tabular-nums">
                    {p.siteId}
                  </div>
                  <div className="hidden md:block font-mono text-[11px] uppercase tracking-eyebrow text-muted-foreground w-24 text-right shrink-0">
                    {new Date(p.createdAt).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
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
