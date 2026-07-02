"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { api, ApiError, roleCan, type Me } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Menu, X } from "lucide-react";

const NAV = [
  { href: "/dashboard", label: "Dashboard", requires: (_m: Me) => true },
  { href: "/properties", label: "Properties", requires: (_m: Me) => true },
  { href: "/sessions", label: "Sessions", requires: (_m: Me) => true },
  { href: "/users", label: "Users", requires: (m: Me) => roleCan.manageUsers(m.user.role) },
  { href: "/account", label: "Account", requires: (_m: Me) => true },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  async function logout() {
    try {
      await api.post("/auth/logout");
    } catch {}
    router.replace("/login");
  }

  if (loading) {
    return (
      <div className="grid min-h-full place-items-center">
        <div className="eyebrow">loading</div>
      </div>
    );
  }
  if (!me) return null;

  return (
    <div className="h-screen overflow-hidden md:grid md:grid-cols-[15rem_1fr]">
      {/* Mobile top bar */}
      <header className="md:hidden fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-rule bg-background px-5">
        <div className="flex items-baseline gap-3">
          <span className="font-serif text-2xl italic">Pager</span>
          <span className="font-mono text-[10px] uppercase tracking-eyebrow text-muted-foreground">
            {me.user.username}
          </span>
        </div>
        <button
          onClick={() => setMobileNavOpen((v) => !v)}
          className="p-2 -mr-2 text-muted-foreground hover:text-foreground transition-colors focus-moss"
          aria-label={mobileNavOpen ? "Close menu" : "Open menu"}
        >
          {mobileNavOpen ? <X className="size-5" strokeWidth={1.5} /> : <Menu className="size-5" strokeWidth={1.5} />}
        </button>
      </header>

      {/* Backdrop */}
      <div
        onClick={() => setMobileNavOpen(false)}
        className={cn(
          "md:hidden fixed inset-0 z-20 bg-foreground/25 backdrop-blur-sm transition-opacity",
          mobileNavOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      />

      {/* Sidebar */}
      <aside
        className={cn(
          "flex flex-col bg-background w-64 md:w-auto min-h-0 md:border-r md:border-rule",
          "fixed inset-y-0 left-0 z-30 transition-transform duration-200 ease-out border-r border-rule",
          mobileNavOpen ? "translate-x-0" : "-translate-x-full",
          "md:static md:h-full md:translate-x-0",
        )}
      >
        <div className="px-6 pt-7 pb-6">
          <div className="font-serif text-3xl italic leading-none">Pager</div>
          <div className="mt-3 flex items-baseline gap-2 min-w-0">
            <span className="text-sm truncate text-foreground">{me.user.username}</span>
            <span className="font-mono text-[10px] uppercase tracking-eyebrow text-moss shrink-0">
              {me.user.role}
            </span>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-6 py-2">
          <ul className="space-y-1">
            {NAV.filter((n) => n.requires(me)).map((n) => {
              const active = pathname === n.href || pathname.startsWith(n.href + "/");
              return (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    className={cn(
                      "group flex items-center gap-3 py-1.5 text-sm transition-colors",
                      active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "w-1.5 h-1.5 rounded-full transition-all",
                        active ? "bg-moss" : "bg-transparent group-hover:bg-rule",
                      )}
                    />
                    <span className={active ? "font-medium" : ""}>{n.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="px-6 pb-6 pt-4">
          <button
            onClick={logout}
            className="font-mono text-[10px] uppercase tracking-eyebrow text-muted-foreground hover:text-foreground transition-colors focus-moss"
          >
            Sign out ↗
          </button>
        </div>
      </aside>

      {/* Main scroll region */}
      <main className="h-full overflow-y-auto min-h-0 pt-14 md:pt-0">
        <div className="mx-auto max-w-5xl px-5 py-8 md:px-12 md:py-14">{children}</div>
      </main>
    </div>
  );
}
