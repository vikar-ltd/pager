"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type AdminSession } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function SessionsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<AdminSession[]>([]);

  async function refresh() {
    const out = await api.get<AdminSession[]>("/admin-sessions");
    setSessions(out.filter((s) => !s.revokedAt));
  }
  useEffect(() => {
    refresh().catch(() => {});
  }, []);

  async function onTerminate(s: AdminSession) {
    if (!confirm(s.current ? "Sign yourself out from this session?" : "Terminate this session?")) return;
    await api.del(`/admin-sessions/${s.id}`);
    if (s.current) {
      router.replace("/login");
      return;
    }
    await refresh();
  }

  async function onTerminateOthers() {
    if (!confirm("Sign out every other session?")) return;
    await api.post<{ revoked: number }>("/admin-sessions/terminate-others");
    await refresh();
  }

  const otherCount = sessions.filter((s) => !s.current).length;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Sessions</h1>
          <p className="text-sm text-muted-foreground">Active admin sessions. Terminating revokes the cookie immediately.</p>
        </div>
        {otherCount > 0 && (
          <Button onClick={onTerminateOthers} variant="outline" size="sm">
            Terminate {otherCount} other{otherCount === 1 ? "" : "s"}
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active sessions</CardTitle>
          <CardDescription>Sorted by last activity.</CardDescription>
        </CardHeader>
        <CardContent>
          {sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No active sessions.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead>IP / country</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last seen</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{s.ua.browser || "Unknown"}</span>
                        <span className="text-muted-foreground">· {s.ua.os || "—"}</span>
                        <span className="text-muted-foreground">· {s.ua.device || "—"}</span>
                        {s.current && <Badge variant="secondary" className="ml-1">current</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <span className="font-mono">{s.ip || "—"}</span>
                      {s.country && <span className="ml-2">{s.country}</span>}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(s.createdAt).toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(s.lastSeenAt).toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <Button onClick={() => onTerminate(s)} variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                        Terminate
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
