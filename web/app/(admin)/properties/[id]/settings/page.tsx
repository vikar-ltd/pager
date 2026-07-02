"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api, type Property } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Section } from "@/components/section";
import { Copy } from "lucide-react";

export default function PropertySettingsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [property, setProperty] = useState<Property | null>(null);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    api.get<Property>(`/properties/${id}`).then((p) => {
      setProperty(p);
      setName(p.name);
      setDomain(p.domain);
    });
  }, [id]);

  if (!property) return <div className="eyebrow">loading…</div>;

  const origin = typeof window !== "undefined" ? window.location.origin : "https://YOUR-PAGER";
  const html = `<script src="${origin}/pub/p.js" data-site-id="${property.siteId}"></script>`;
  const next = `import Script from "next/script";

<Script
  src="${origin}/pub/p.js"
  data-site-id="${property.siteId}"
  strategy="afterInteractive"
/>`;

  async function copy(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
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
    <div className="space-y-14">
      <Section label="Install the snippet">
        <p className="mb-6 text-sm text-muted-foreground leading-relaxed max-w-lg">
          Paste this onto every page you want tracked. It handles SPA route changes on its own.
        </p>

        <div className="space-y-6">
          <SnippetBlock
            heading="Plain HTML"
            code={html}
            onCopy={() => copy(html, "html")}
            copied={copied === "html"}
          />
          <SnippetBlock
            heading="Next.js — app/layout.tsx"
            code={next}
            onCopy={() => copy(next, "next")}
            copied={copied === "next"}
          />
        </div>

        <div className="mt-8 max-w-lg text-sm text-muted-foreground leading-relaxed">
          <div className="eyebrow mb-2">Tracking across subdomains</div>
          <p>
            If this property spans multiple subdomains (say{" "}
            <code className="font-mono text-foreground">www.example.com</code> and{" "}
            <code className="font-mono text-foreground">app.example.com</code>), add a{" "}
            <code className="font-mono text-foreground">data-cookie-domain</code> attribute
            so the visitor and session cookies are shared across them:
          </p>
          <pre className="mt-3 border-l-2 border-moss pl-4 py-2 font-mono text-xs text-foreground overflow-x-auto whitespace-pre bg-accent/25">
{`<script
  src="${origin}/pub/p.js"
  data-site-id="${property.siteId}"
  data-cookie-domain=".example.com"
></script>`}
          </pre>
          <p className="mt-3">
            The leading dot matters — it tells the browser to serve the cookie back on every
            subdomain of that host. Without it, a person crossing from{" "}
            <code className="font-mono text-foreground">www.</code> to{" "}
            <code className="font-mono text-foreground">app.</code> looks like a new visitor.
          </p>
        </div>
      </Section>

      <Section label="Property details">
        <form onSubmit={onSave} className="grid gap-6 sm:grid-cols-[1fr_1fr_auto] sm:items-end max-w-2xl">
          <div className="space-y-2">
            <Label htmlFor="s-name">Name</Label>
            <Input id="s-name" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="s-domain">Domain</Label>
            <Input id="s-domain" value={domain} onChange={(e) => setDomain(e.target.value)} />
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </form>
      </Section>

      <Section label="Danger zone">
        <p className="mb-4 text-sm text-muted-foreground max-w-lg">
          Deleting a property stops new event ingest for this site ID. Existing events stay in Mongo — nothing about the past changes.
        </p>
        <button
          onClick={onDelete}
          className="font-mono text-[11px] uppercase tracking-eyebrow text-destructive hover:underline underline-offset-4 decoration-destructive"
        >
          Delete this property →
        </button>
      </Section>
    </div>
  );
}

function SnippetBlock({
  heading,
  code,
  onCopy,
  copied,
}: {
  heading: string;
  code: string;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <div className="font-mono text-[10px] uppercase tracking-eyebrow text-muted-foreground">{heading}</div>
        <button
          onClick={onCopy}
          className="font-mono text-[10px] uppercase tracking-eyebrow text-muted-foreground hover:text-foreground inline-flex items-center gap-1 transition-colors"
        >
          {copied ? "Copied ✓" : (<><Copy className="size-3" /> Copy</>)}
        </button>
      </div>
      <pre className="border-l-2 border-moss pl-4 py-2 font-mono text-xs text-foreground overflow-x-auto whitespace-pre bg-accent/25">
        {code}
      </pre>
    </div>
  );
}
