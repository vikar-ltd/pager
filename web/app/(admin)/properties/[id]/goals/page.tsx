"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, type Goal } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Section } from "@/components/section";

export default function GoalsPage() {
  const { id } = useParams<{ id: string }>();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"url" | "event">("url");
  const [pattern, setPattern] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    setGoals(await api.get<Goal[]>(`/properties/${id}/goals`));
  }
  useEffect(() => {
    refresh().catch(() => {});
  }, [id]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post(`/properties/${id}/goals`, { name, kind, pattern });
      setName("");
      setPattern("");
      await refresh();
    } catch (e: any) {
      setError(e?.message || "Failed to create goal");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(gid: string) {
    if (!confirm("Delete this goal?")) return;
    await api.del(`/goals/${gid}`);
    await refresh();
  }

  return (
    <div className="space-y-14">
      <div className="max-w-2xl">
        <p className="text-sm text-muted-foreground leading-relaxed">
          A goal is a conversion criterion. <em>URL goals</em> match the event path with a regex.
          <em> Event goals</em> match a custom event name exactly.
        </p>
      </div>

      <Section label="Add a goal">
        <form onSubmit={onCreate} className="grid gap-6 sm:grid-cols-[1fr_9rem_1fr_auto] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="g-name">Name</Label>
            <Input id="g-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Reached signup" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="g-kind">Kind</Label>
            <select
              id="g-kind"
              value={kind}
              onChange={(e) => setKind(e.target.value as "url" | "event")}
              className="w-full h-9 py-2 border-b border-input bg-transparent text-sm focus:outline-none focus:border-foreground"
            >
              <option value="url">URL match</option>
              <option value="event">Custom event</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="g-pattern">{kind === "url" ? "Path regex" : "Event name"}</Label>
            <Input
              id="g-pattern"
              required
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              placeholder={kind === "url" ? "^/signup" : "signup_completed"}
              className="font-mono"
            />
          </div>
          <Button type="submit" variant="moss" disabled={busy || !name.trim() || !pattern.trim()}>
            {busy ? "…" : "Add goal"}
          </Button>
        </form>
        {error && <div className="mt-4 text-sm text-destructive">{error}</div>}
      </Section>

      <Section label={`All goals · ${goals.length}`}>
        {goals.length === 0 ? (
          <p className="py-6 font-serif text-2xl italic text-muted-foreground">
            No goals yet.
          </p>
        ) : (
          <ul className="row-divide">
            {goals.map((g) => (
              <li key={g.id} className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_5rem_1fr_auto] gap-x-6 gap-y-1 items-center py-4">
                <div className="text-sm text-foreground">{g.name}</div>
                <div className="font-mono text-[10px] uppercase tracking-eyebrow text-moss md:text-left text-right">
                  {g.kind}
                </div>
                <div className="col-span-2 md:col-span-1 font-mono text-xs text-muted-foreground break-all">
                  {g.pattern}
                </div>
                <div className="col-span-2 md:col-span-1 text-right">
                  <button
                    onClick={() => onDelete(g.id)}
                    className="font-mono text-[10px] uppercase tracking-eyebrow text-muted-foreground hover:text-destructive transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
