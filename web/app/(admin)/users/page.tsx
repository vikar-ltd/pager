"use client";

import { useEffect, useState } from "react";
import { api, ApiError, roleCan, type Me, type Role, type User } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Section } from "@/components/section";
import { cn } from "@/lib/utils";

const ROLES: Role[] = ["root", "admin", "viewer"];

export default function UsersPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [uname, setUname] = useState("");
  const [pw, setPw] = useState("");
  const [role, setRole] = useState<Role>("viewer");

  async function refresh() {
    const [m, us] = await Promise.all([api.get<Me>("/auth/me"), api.get<User[]>("/users")]);
    setMe(m);
    setUsers(us);
    if (m.user.role === "admin" && role !== "viewer") setRole("viewer");
  }

  useEffect(() => {
    refresh().catch(() => {});
  }, []);

  if (!me) return <div className="eyebrow">loading…</div>;

  const meResolved = me;
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
    <div className="space-y-14">
      <header className="max-w-2xl">
        <div className="eyebrow">Users</div>
        <h1 className="mt-3 font-serif text-4xl md:text-5xl leading-[1.05] tracking-tight">
          Who else has the keys.
        </h1>
        <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
          {actor === "root"
            ? "You have full control. Create any role, change existing ones, reset passwords."
            : "Admins can only create and delete viewers. Role changes require a root user."}
        </p>
      </header>

      <Section label="Add someone">
        <form onSubmit={onCreate} className="grid gap-6 sm:grid-cols-[1fr_1fr_9rem_auto] sm:items-end">
          <div className="space-y-2">
            <Label htmlFor="uname">Username</Label>
            <Input id="uname" required value={uname} onChange={(e) => setUname(e.target.value)} placeholder="carol" autoComplete="off" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pw">Initial password</Label>
            <Input id="pw" type="password" required minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" placeholder="min 8 chars" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="w-full h-9 py-2 border-b border-input bg-transparent text-sm focus:outline-none focus:border-foreground"
            >
              {creatableRoles.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="moss" disabled={busy || !uname.trim() || pw.length < 8}>
            {busy ? "Creating…" : "Add user"}
          </Button>
        </form>
        {error && <div className="mt-4 text-sm text-destructive">{error}</div>}
      </Section>

      <Section label={`Everyone · ${users.length}`}>
        <ul className="row-divide">
          {users.map((u) => {
            const isSelf = u.id === meResolved.user.id;
            const canDelete = roleCan.delete(actor, u.role) && !(isSelf && u.role === "root");
            const canChangeRole = roleCan.changeRole(actor);
            const canResetPw = roleCan.resetPassword(actor) && !isSelf;
            const canRename = actor === "root" && !isSelf;
            return (
              <li key={u.id} className="group py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-lg text-foreground">{u.username}</span>
                      {isSelf && (
                        <span className="font-mono text-[10px] uppercase tracking-eyebrow text-moss">
                          you
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-baseline gap-3 font-mono text-[11px] uppercase tracking-eyebrow text-muted-foreground">
                      {canChangeRole ? (
                        <select
                          value={u.role}
                          onChange={(e) => onChangeRole(u, e.target.value as Role)}
                          disabled={isSelf && u.role === "root"}
                          className="bg-transparent border-0 -mx-1 px-1 py-0 font-mono text-[11px] uppercase tracking-eyebrow focus:outline-none focus:bg-accent/50 rounded-sm cursor-pointer disabled:cursor-not-allowed"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                      ) : (
                        <span className={cn(u.role === "root" ? "text-moss" : "")}>{u.role}</span>
                      )}
                      <span>· since {new Date(u.createdAt).toLocaleDateString([], { month: "short", year: "numeric" })}</span>
                    </div>
                  </div>
                  <div className="flex items-baseline gap-4 shrink-0 md:opacity-0 md:group-hover:opacity-100 md:focus-within:opacity-100 md:transition-opacity">
                    {canRename && (
                      <ActionLink onClick={() => onRename(u)}>Rename</ActionLink>
                    )}
                    {canResetPw && (
                      <ActionLink onClick={() => onResetPassword(u)}>Reset password</ActionLink>
                    )}
                    {canDelete && (
                      <ActionLink onClick={() => onDelete(u)} destructive>Delete</ActionLink>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
}

function ActionLink({
  onClick,
  children,
  destructive,
}: {
  onClick: () => void;
  children: React.ReactNode;
  destructive?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "font-mono text-[10px] uppercase tracking-eyebrow transition-colors",
        destructive
          ? "text-muted-foreground hover:text-destructive"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
