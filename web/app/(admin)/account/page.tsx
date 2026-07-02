"use client";

import { useEffect, useState } from "react";
import { api, ApiError, type Me } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Section } from "@/components/section";

type Msg = { kind: "ok" | "err"; text: string } | null;

export default function AccountPage() {
  const [me, setMe] = useState<Me | null>(null);

  async function refresh() {
    setMe(await api.get<Me>("/auth/me"));
  }
  useEffect(() => {
    refresh().catch(() => {});
  }, []);

  if (!me) return <div className="eyebrow">loading…</div>;

  return (
    <div className="space-y-14">
      <header className="max-w-2xl">
        <div className="eyebrow">Account</div>
        <h1 className="mt-3 font-serif text-4xl md:text-5xl leading-[1.05] tracking-tight break-all">
          {me.user.username}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Signed in as <span className="font-mono text-moss uppercase tracking-eyebrow text-[10px]">{me.user.role}</span>
        </p>
      </header>

      <UsernameSection current={me.user.username} onSaved={refresh} />
      <PasswordSection />
    </div>
  );
}

function UsernameSection({ current, onSaved }: { current: string; onSaved: () => void }) {
  const [pw, setPw] = useState("");
  const [next, setNext] = useState(current);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (next === current) {
      setMsg({ kind: "err", text: "That's the current username." });
      return;
    }
    setBusy(true);
    try {
      await api.post("/auth/change-username", { currentPassword: pw, newUsername: next });
      setMsg({ kind: "ok", text: "Username updated. Existing sessions stay signed in." });
      setPw("");
      onSaved();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof ApiError ? e.message : "Something went wrong." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section label="Rename yourself">
      <form onSubmit={onSubmit} className="max-w-md space-y-6">
        <div className="space-y-2">
          <Label htmlFor="new-username">New username</Label>
          <Input id="new-username" required value={next} onChange={(e) => setNext(e.target.value)} autoComplete="username" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pw-for-rename">Current password</Label>
          <Input id="pw-for-rename" type="password" required value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
        </div>
        {msg && (
          <div className={msg.kind === "ok" ? "text-sm text-moss" : "text-sm text-destructive"}>{msg.text}</div>
        )}
        <Button type="submit" disabled={busy || !next.trim() || next === current}>
          {busy ? "Saving…" : "Update username"}
        </Button>
      </form>
    </Section>
  );
}

function PasswordSection() {
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
    <Section label="Change password">
      <form onSubmit={onSubmit} className="max-w-md space-y-6">
        <div className="space-y-2">
          <Label htmlFor="cur">Current password</Label>
          <Input id="cur" type="password" required value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="new-pw">New password</Label>
          <Input id="new-pw" type="password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" placeholder="min 8 characters" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="conf">Confirm new password</Label>
          <Input id="conf" type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </div>
        {msg && (
          <div className={msg.kind === "ok" ? "text-sm text-moss" : "text-sm text-destructive"}>{msg.text}</div>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Update password"}
        </Button>
      </form>
    </Section>
  );
}
