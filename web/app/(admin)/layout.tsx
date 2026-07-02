"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { api, ApiError, roleCan, type Me } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Gauge, Globe, KeyRound, LogOut, User as UserIcon, Users } from "lucide-react";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: Gauge, requires: (_m: Me) => true },
  { href: "/properties", label: "Properties", icon: Globe, requires: (_m: Me) => true },
  { href: "/sessions", label: "Sessions", icon: KeyRound, requires: (_m: Me) => true },
  { href: "/users", label: "Users", icon: Users, requires: (m: Me) => roleCan.manageUsers(m.user.role) },
  { href: "/account", label: "Account", icon: UserIcon, requires: (_m: Me) => true },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<Me>("/auth/me")
      .then((m) => setMe(m))
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) {
          router.replace(`/login?next=${encodeURIComponent(pathname)}`);
        }
      })
      .finally(() => setLoading(false));
  }, [router, pathname]);

  async function logout() {
    try {
      await api.post("/auth/logout");
    } catch {}
    router.replace("/login");
  }

  if (loading) {
    return <div className="grid min-h-full place-items-center text-sm text-muted-foreground">Loading…</div>;
  }
  if (!me) return null;

  return (
    // Pin the whole admin frame to the viewport height so only the <main>
    // area scrolls — the sidebar stays put no matter how tall the section is.
    <div className="h-screen grid grid-cols-[14rem_1fr] overflow-hidden">
      <aside className="border-r bg-card flex flex-col h-full min-h-0">
        <div className="px-5 py-5 border-b">
          <div className="text-base font-semibold tracking-tight">Pager</div>
          <div className="text-xs text-muted-foreground flex items-baseline gap-1.5">
            <span>{me.user.username}</span>
            <span className="text-[10px] uppercase tracking-wider bg-accent rounded px-1 py-0.5 text-accent-foreground">{me.user.role}</span>
          </div>
        </div>
        <nav className="flex-1 px-2 py-3 space-y-1">
          {NAV.filter((n) => n.requires(me)).map((n) => {
            const active = pathname === n.href || pathname.startsWith(n.href + "/");
            const Icon = n.icon;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <Icon className="size-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t">
          <Button onClick={logout} variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground">
            <LogOut className="size-4" />
            Sign out
          </Button>
        </div>
      </aside>
      <main className="overflow-y-auto min-h-0">
        <div className="mx-auto max-w-5xl px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
