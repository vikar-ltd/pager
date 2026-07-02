"use client";

import { useEffect, useState } from "react";
import { api, ApiError, roleCan, type Me, type Role, type User } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, KeyRound, Pencil } from "lucide-react";

const ROLES: Role[] = ["root", "admin", "viewer"];

export default function UsersPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // create form
  const [uname, setUname] = useState("");
  const [pw, setPw] = useState("");
  const [role, setRole] = useState<Role>("viewer");

  async function refresh() {
    const [m, us] = await Promise.all([api.get<Me>("/auth/me"), api.get<User[]>("/users")]);
    setMe(m);
    setUsers(us);
    // clamp default create role to what this actor can create
    if (m.user.role === "admin" && role !== "viewer") setRole("viewer");
  }

  useEffect(() => {
    refresh().catch(() => {});
  }, []);

  if (!me) return <div className="text-sm text-muted-foreground">Loading…</div>;

  const meResolved = me; // narrow for use inside async closures below
  const actor = meResolved.user.role;
  const creatableRoles = ROLES.filter((t) => roleCan.create(actor, t));

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await api.post("/users", { username: uname, password: pw, role });
      setUname("");
      setPw("");
      setRole(actor === "admin" ? "viewer" : role);
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to create user");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(u: User) {
    const label = u.id === meResolved.user.id ? "yourself" : u.username;
    if (!confirm(`Delete ${label}? Any active sessions for this user will be revoked.`)) return;
    try {
      await api.del(`/users/${u.id}`);
      await refresh();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Failed to delete");
    }
  }

  async function onChangeRole(u: User, newRole: Role) {
    if (newRole === u.role) return;
    if (!confirm(`Change ${u.username}'s role to ${newRole}? Their active sessions will be revoked.`)) return;
    try {
      await api.patch(`/users/${u.id}/role`, { role: newRole });
      await refresh();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Failed to change role");
    }
  }

  async function onResetPassword(u: User) {
    const p = prompt(`New password for ${u.username} (min 8 chars):`);
    if (!p) return;
    try {
      await api.patch(`/users/${u.id}/password`, { password: p });
      alert(`Password reset. ${u.username}'s existing sessions were revoked.`);
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Failed to reset password");
    }
  }

  async function onRename(u: User) {
    const n = prompt(`Rename "${u.username}" to:`, u.username);
    if (!n || n === u.username) return;
    try {
      await api.patch(`/users/${u.id}/username`, { username: n });
      await refresh();
    } catch (e) {
      alert(e instanceof ApiError ? e.message : "Failed to rename");
    }
  }

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">
          {actor === "root"
            ? "Full control. You can create any role and change existing ones."
            : "Admins can only create and delete viewers. Role changes require a root user."}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New user</CardTitle>
          <CardDescription>Passwords must be at least 8 characters. Communicate the initial password to the user out-of-band.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onCreate} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_10rem_auto] gap-3 items-end">
            <div className="space-y-1.5">
              <Label htmlFor="uname">Username</Label>
              <Input id="uname" required value={uname} onChange={(e) => setUname(e.target.value)} placeholder="carol" autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw">Initial password</Label>
              <Input id="pw" type="password" required minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role">Role</Label>
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {creatableRoles.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" disabled={busy || !uname.trim() || pw.length < 8}>
              {busy ? "Creating…" : "Create user"}
            </Button>
          </form>
          {error && <div className="mt-3 text-sm text-destructive">{error}</div>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All users</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Username</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => {
                const isSelf = u.id === meResolved.user.id;
                const canDelete = roleCan.delete(actor, u.role) && !(isSelf && u.role === "root");
                const canChangeRole = roleCan.changeRole(actor);
                const canResetPw = roleCan.resetPassword(actor) && !isSelf;
                // Root can rename anyone via the admin API; each user renames
                // themselves from /account, so we hide the row action there.
                const canRename = actor === "root" && !isSelf;
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {u.username}
                      {isSelf && <span className="text-xs text-muted-foreground ml-2">(you)</span>}
                    </TableCell>
                    <TableCell>
                      {canChangeRole ? (
                        <select
                          value={u.role}
                          onChange={(e) => onChangeRole(u, e.target.value as Role)}
                          className="h-7 rounded border border-input bg-background px-2 text-xs"
                          disabled={isSelf && u.role === "root" /* last-root guardrail — actual enforcement server-side */}
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Badge variant={u.role === "root" ? "default" : u.role === "admin" ? "secondary" : "outline"}>
                          {u.role}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{new Date(u.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {canRename && (
                          <Button size="icon" variant="ghost" onClick={() => onRename(u)} title="Rename user">
                            <Pencil className="size-4" />
                          </Button>
                        )}
                        {canResetPw && (
                          <Button size="icon" variant="ghost" onClick={() => onResetPassword(u)} title="Reset password">
                            <KeyRound className="size-4" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => onDelete(u)}
                            className="text-muted-foreground hover:text-destructive"
                            title="Delete user"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
