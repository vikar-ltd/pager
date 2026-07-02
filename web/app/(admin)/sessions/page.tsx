"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type AdminSession } from "@/lib/api";
import { Section } from "@/components/section";

export default function SessionsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [loaded, setLoaded] = useState(false);

  async function refresh() {
    const out = await api.get<AdminSession[]>("/admin-sessions");
    setSessions(out.filter((s) => !s.revokedAt));
    setLoaded(true);
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
    <div className="space-y-10">
      <header className="max-w-2xl">
        <div className="eyebrow">Sessions</div>
        <h1 className="mt-3 font-serif text-4xl md:text-5xl leading-[1.05] tracking-tight">
          Every device <em className="italic">signed in as you</em>.
        </h1>
        <p className="mt-4 text-sm text-muted-foreground leading-relaxed">
          Only your own sessions are shown — everyone else's are private to them.
          Terminating a session signs that device out immediately.
        </p>
      </header>

      <Section
        label={loaded ? `Active · ${sessions.length}` : "Active"}
        aside={
          otherCount > 0 ? (
            <button
              onClick={onTerminateOthers}
              className="font-mono text-[10px] uppercase tracking-eyebrow text-muted-foreground hover:text-destructive transition-colors"
            >
              Sign out {otherCount} other{otherCount === 1 ? "" : "s"} →
            </button>
          ) : null
        }
      >
        {!loaded ? (
          <div className="eyebrow py-6">loading…</div>
        ) : sessions.length === 0 ? (
          <p className="py-6 font-serif text-2xl italic text-muted-foreground">No active sessions.</p>
        ) : (
          <ul className="row-divide">
            {sessions.map((s) => (
              <li key={s.id} className="py-5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      {s.current && (
                        <span className="w-1.5 h-1.5 rounded-full bg-moss self-center" aria-label="current session" />
                      )}
                      <span className="text-lg text-foreground">{s.ua.browser || "Unknown"}</span>
                      <span className="text-sm text-muted-foreground">
                        on {s.ua.os || "—"}
                      </span>
                      {s.current && (
                        <span className="font-mono text-[10px] uppercase tracking-eyebrow text-moss">
                          this device
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-baseline gap-x-3 gap-y-1 flex-wrap font-mono text-[11px] text-muted-foreground">
                      <span className="tabular-nums">{s.ip || "—"}</span>
                      {s.country && <span className="uppercase tracking-eyebrow">{s.country}</span>}
                      <span>·</span>
                      <span className="uppercase tracking-eyebrow">last seen {timeAgo(s.lastSeenAt)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => onTerminate(s)}
                    className="font-mono text-[10px] uppercase tracking-eyebrow text-muted-foreground hover:text-destructive transition-colors shrink-0"
                  >
                    Terminate →
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

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const s = Math.max(0, Math.floor((now - then) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}
