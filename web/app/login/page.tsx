"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") || "/dashboard";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post("/auth/login", { username, password });
      router.push(next);
      router.refresh();
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Something went wrong";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm">
      <div className="mb-10 text-center">
        <div className="font-serif text-6xl italic leading-none">Pager</div>
        <div className="mt-4 eyebrow">Sign in to continue</div>
      </div>

      <div className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="u">Username</Label>
          <Input id="u" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required autoFocus />
        </div>
        <div className="space-y-2">
          <Label htmlFor="p">Password</Label>
          <Input
            id="p"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && <div className="text-sm text-destructive">{error}</div>}

        <Button type="submit" variant="moss" className="w-full" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-full grid place-items-center p-6">
      <Suspense fallback={<div className="eyebrow">loading…</div>}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
