"use client";

import { useEffect } from "react";

/**
 * Registers the service worker once, on client hydration. Only runs in
 * production builds — in dev mode the SW can shadow HMR and cause
 * confusing stale-page bugs, so we skip it entirely.
 */
export function PWARegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Registration failure is non-fatal — the app still works, just
        // without offline caching or Chrome's install prompt.
      });
    };

    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
