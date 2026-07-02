"use client";

import { useEffect, useState } from "react";
import { api, ApiError, type Me } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Msg = { kind: "ok" | "err"; text: string } | null;

export default function AccountPage() {
  const [me, setMe] = useState<Me | null>(null);

  async function refresh() {
    setMe(await api.get<Me>("/auth/me"));
  }
  useEffect(() => {
    refresh().catch(() => {});
  }, []);

  if (!me) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as <strong>{me.user.username}</strong> with role{" "}
          <Badge variant="outline">{me.user.role}</Badge>
        </p>
      </div>

      <UsernameCard current={me.user.username} onSaved={refresh} />
      <PasswordCard />
    </div>
  );
}

function UsernameCard({ current, onSaved }: { current: string; onSaved: () => void }) {
  const [pw, setPw] = useState("");
  const [next, setNext] = useState(current);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (next === current) {
      setMsg({ kind: "err", text: "New username is the same as the current one." });
      return;
    }
    setBusy(true);
    try {
      await api.post("/auth/change-username", { currentPassword: pw, newUsername: next });
      setMsg({ kind: "ok", text: "Username updated. Your existing sessions stay signed in." });
      setPw("");
      onSaved();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof ApiError ? e.message : "Something went wrong." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>Change username</CardTitle>
        <CardDescription>
          Requires your current password. Sessions stay valid — the cached name on the sessions list refreshes automatically.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="new-username">New username</Label>
            <Input
              id="new-username"
              required
              value={next}
              onChange={(e) => setNext(e.target.value)}
              autoComplete="username"
              placeholder="new_username"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw-for-rename">Current password</Label>
            <Input
              id="pw-for-rename"
              type="password"
              required
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          {msg && (
            <div className={msg.kind === "ok" ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>{msg.text}</div>
          )}
          <Button type="submit" disabled={busy || !next.trim() || next === current}>
            {busy ? "Saving…" : "Update username"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function PasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (next.length < 8) {
      setMsg({ kind: "err", text: "New password must be at least 8 characters." });
      return;
    }
    if (next !== confirm) {
      setMsg({ kind: "err", text: "The two new-password fields don't match." });
      return;
    }
    setBusy(true);
    try {
      await api.post("/auth/change-password", { currentPassword: current, newPassword: next });
      setMsg({ kind: "ok", text: "Password updated. This session stays signed in." });
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof ApiError ? e.message : "Something went wrong." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>Change password</CardTitle>
        <CardDescription>You'll need your current password. Other sessions belonging to you are not signed out.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cur">Current password</Label>
            <Input id="cur" type="password" required value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-pw">New password</Label>
            <Input id="new-pw" type="password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="conf">Confirm new password</Label>
            <Input id="conf" type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          </div>
          {msg && (
            <div className={msg.kind === "ok" ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>{msg.text}</div>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Update password"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
