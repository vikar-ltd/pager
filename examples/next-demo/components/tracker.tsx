"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

// Reads the site ID from localStorage so the demo can be reconfigured without
// a rebuild. If the site ID isn't set yet, we render nothing and the header
// banner nudges the user to paste one in.
export function Tracker() {
  const [siteId, setSiteId] = useState<string | null>(null);
  const [pagerUrl, setPagerUrl] = useState<string>("");

  useEffect(() => {
    setSiteId(localStorage.getItem("pager_site_id"));
    setPagerUrl(localStorage.getItem("pager_url") || defaultPagerUrl());
  }, []);

  if (!siteId || !pagerUrl) return null;

  return (
    <Script
      src={`${pagerUrl}/pub/p.js`}
      data-site-id={siteId}
      strategy="afterInteractive"
    />
  );
}

function defaultPagerUrl(): string {
  if (typeof window === "undefined") return "";
  // Default: assume Pager is on port 8080 of the same host as the demo.
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:8080`;
}
