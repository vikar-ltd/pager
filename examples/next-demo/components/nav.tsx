"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/pricing", label: "Pricing" },
  { href: "/signup", label: "Sign up" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <header style={{ borderBottom: "1px solid #eee", padding: "1rem 2rem", background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
        <strong>Demo shop</strong>
        <nav style={{ display: "flex", gap: "1rem" }}>
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              style={{
                textDecoration: "none",
                color: pathname === l.href ? "#111" : "#666",
                fontWeight: pathname === l.href ? 600 : 400,
              }}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
      <ConfigBanner />
    </header>
  );
}

function ConfigBanner() {
  const [siteId, setSiteId] = useState<string | null>(null);
  const [pagerUrl, setPagerUrl] = useState<string>("");
  const [editing, setEditing] = useState(false);
  const [draftSite, setDraftSite] = useState("");
  const [draftUrl, setDraftUrl] = useState("");

  useEffect(() => {
    setSiteId(localStorage.getItem("pager_site_id"));
    setPagerUrl(localStorage.getItem("pager_url") || `http://${location.hostname}:8080`);
  }, []);

  function save() {
    localStorage.setItem("pager_site_id", draftSite);
    localStorage.setItem("pager_url", draftUrl);
    location.reload();
  }

  const base = { marginTop: "0.75rem", fontSize: 13, color: "#666" };
  if (!siteId || editing) {
    return (
      <div style={{ ...base, background: "#fff8e1", padding: "0.5rem 0.75rem", borderRadius: 4 }}>
        Pager not configured.
        <input
          placeholder="site ID"
          value={draftSite}
          onChange={(e) => setDraftSite(e.target.value)}
          style={{ marginLeft: 8, padding: "2px 6px" }}
        />
        <input
          placeholder="pager base URL"
          value={draftUrl || pagerUrl}
          onChange={(e) => setDraftUrl(e.target.value)}
          style={{ marginLeft: 4, padding: "2px 6px", width: 220 }}
        />
        <button onClick={save} style={{ marginLeft: 8 }} disabled={!draftSite || !draftUrl}>
          Save & reload
        </button>
      </div>
    );
  }
  return (
    <div style={base}>
      Tracking as <code>{siteId}</code> @ <code>{pagerUrl}</code>{" "}
      <button
        onClick={() => {
          setDraftSite(siteId);
          setDraftUrl(pagerUrl);
          setEditing(true);
        }}
        style={{ marginLeft: 6, fontSize: 12 }}
      >
        change
      </button>
    </div>
  );
}
