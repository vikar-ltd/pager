"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, type Property } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Copy } from "lucide-react";

export default function PropertySettingsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [property, setProperty] = useState<Property | null>(null);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.get<Property>(`/properties/${id}`).then((p) => {
      setProperty(p);
      setName(p.name);
      setDomain(p.domain);
    });
  }, [id]);

  if (!property) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const origin = typeof window !== "undefined" ? window.location.origin : "https://YOUR-PAGER";
  const snippet = `<script src="${origin}/pub/p.js" data-site-id="${property.siteId}"></script>`;
  const nextSnippet = `import Script from "next/script";

<Script
  src="${origin}/pub/p.js"
  data-site-id="${property.siteId}"
  strategy="afterInteractive"
/>`;

  async function copy(t: string) {
    await navigator.clipboard.writeText(t);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const updated = await api.patch<Property>(`/properties/${id}`, { name, domain });
      setProperty(updated);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (!confirm(`Delete "${property?.name}"? Existing events stay in the DB but new ones for this site ID stop being recorded.`)) return;
    await api.del(`/properties/${id}`);
    router.push("/properties");
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Install the snippet</CardTitle>
          <CardDescription>Paste this onto every page you want tracked.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Plain HTML</div>
            <div className="relative">
              <pre className="overflow-x-auto rounded-md border bg-muted/50 px-4 py-3 text-xs font-mono">{snippet}</pre>
              <Button size="sm" variant="ghost" onClick={() => copy(snippet)} className="absolute right-1 top-1">
                <Copy className="size-3.5" />
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Next.js (app/layout.tsx)</div>
            <div className="relative">
              <pre className="overflow-x-auto rounded-md border bg-muted/50 px-4 py-3 text-xs font-mono whitespace-pre">{nextSnippet}</pre>
              <Button size="sm" variant="ghost" onClick={() => copy(nextSnippet)} className="absolute right-1 top-1">
                <Copy className="size-3.5" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              SPA route changes are auto-detected via <code className="font-mono">history.pushState</code>; no{" "}
              <code className="font-mono">usePathname()</code> effect needed.
            </p>
          </div>
          {copied && <div className="text-xs text-muted-foreground">Copied ✓</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Property details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSave} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="domain">Domain</Label>
              <Input id="domain" value={domain} onChange={(e) => setDomain(e.target.value)} />
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">Danger zone</CardTitle>
          <CardDescription>Deleting a property stops new event ingest for this site ID. Existing events stay in Mongo.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={onDelete} variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10">
            Delete property
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
