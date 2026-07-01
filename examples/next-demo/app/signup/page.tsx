"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function SignupPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onSignup() {
    setBusy(true);
    // Fire a custom event via the tracker. window.pager is installed by the
    // snippet as soon as it loads; if it's not there yet (e.g. the user came
    // straight to /signup and it's still fetching), the click is a no-op.
    (window as any).pager?.("signup_completed", { plan: "pro" });
    setTimeout(() => router.push("/done"), 100);
  }

  return (
    <div>
      <h1>Sign up</h1>
      <p>This button fires <code>window.pager(&quot;signup_completed&quot;, {"{ plan: 'pro' }"})</code> and then navigates to /done.</p>
      <button onClick={onSignup} disabled={busy} style={{ padding: "0.5rem 1rem", fontSize: 15 }}>
        {busy ? "…" : "Complete signup"}
      </button>
    </div>
  );
}
