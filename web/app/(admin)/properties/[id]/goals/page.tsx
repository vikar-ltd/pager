"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, type Goal } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2 } from "lucide-react";

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
    <div className="space-y-6">
      <div>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Goals</h2>
        <p className="text-xs text-muted-foreground mt-1">URL goals match the event path with a regex. Event goals match a custom event name exactly.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New goal</CardTitle>
          <CardDescription>
            URL example: <code className="font-mono">^/signup</code>. Event example: <code className="font-mono">signup_completed</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onCreate} className="grid grid-cols-1 sm:grid-cols-[1fr_8rem_1fr_auto] gap-3 items-end">
            <div className="space-y-1.5">
              <Label htmlFor="g-name">Name</Label>
              <Input id="g-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Reached signup" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="g-kind">Kind</Label>
              <select
                id="g-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as "url" | "event")}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="url">URL</option>
                <option value="event">Event</option>
              </select>
            </div>
            <div className="space-y-1.5">
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
            <Button type="submit" disabled={busy || !name.trim() || !pattern.trim()}>
              {busy ? "…" : "Add"}
            </Button>
          </form>
          {error && <div className="mt-3 text-sm text-destructive">{error}</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All goals</CardTitle>
        </CardHeader>
        <CardContent>
          {goals.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No goals yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Pattern</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {goals.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="font-medium">{g.name}</TableCell>
                    <TableCell>
                      <Badge variant={g.kind === "url" ? "secondary" : "outline"}>{g.kind}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{g.pattern}</TableCell>
                    <TableCell>
                      <Button onClick={() => onDelete(g.id)} variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
