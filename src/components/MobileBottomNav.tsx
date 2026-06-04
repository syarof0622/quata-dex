import { Link, useRouterState } from "@tanstack/react-router";
import { useState } from "react";
import {
  LayoutDashboard, Bot, TrendingUp, PieChart, MoreHorizontal,
  FlaskConical, Star, Newspaper, Bell, HeartPulse, Settings, SlidersHorizontal,
  Sparkles, LogOut, X,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "@tanstack/react-router";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { UI_LABELS_ID } from "@/lib/i18n/id";

const L = UI_LABELS_ID.nav;

const PRIMARY = [
  { to: "/dashboard", icon: LayoutDashboard, label: L.home, search: undefined as any },
  { to: "/ai", icon: Bot, label: L.analyst, search: undefined as any },
  { to: "/lab", icon: Sparkles, label: L.agent, search: { tab: "agent" } as any },
  { to: "/portfolio", icon: PieChart, label: L.portfolio, search: undefined as any },
] as const;

const MORE_ITEMS = [
  { to: "/market", icon: TrendingUp, label: L.market },
  { to: "/lab", icon: FlaskConical, label: L.simulationLab },
  { to: "/watchlist", icon: Star, label: L.watchlist },
  { to: "/screener", icon: SlidersHorizontal, label: L.screener },
  { to: "/expert", icon: Sparkles, label: L.expertTools },
  { to: "/news", icon: Newspaper, label: L.news },
  { to: "/alerts", icon: Bell, label: L.alerts },
  { to: "/health", icon: HeartPulse, label: L.systemHealth },
  { to: "/settings", icon: Settings, label: L.settings },
] as const;

export function MobileBottomNav() {
  const path = useRouterState({ select: s => s.location.pathname });
  const { signOut } = useAuth();
  const nav = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreActive = MORE_ITEMS.some(i => path.startsWith(i.to));

  return (
    <nav
      className="md:hidden fixed left-0 right-0 z-40 pointer-events-none"
      style={{ bottom: 0, paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="px-3 pb-2 pt-1 pointer-events-none">
        <div
          className="pointer-events-auto mx-auto max-w-md rounded-2xl border border-border bg-background/85 backdrop-blur-xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.6)] flex items-stretch justify-between px-1 py-1"
          style={{ minHeight: 60 }}
        >
          {PRIMARY.map(({ to, icon: Icon, label, search }) => {
            const active = path === to || path.startsWith(to + "/") || (to === "/lab" && label === L.agent && path.startsWith("/lab"));
            return (
              <Link
                key={label}
                to={to}
                search={search as any}
                className="flex-1 flex flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 transition-colors"
                style={{
                  color: active ? "var(--primary)" : "var(--muted-foreground)",
                  background: active ? "color-mix(in oklab, var(--primary) 10%, transparent)" : "transparent",
                }}
              >
                <Icon className="size-[18px]" />
                <span className="text-[10px] font-medium leading-none">{label}</span>
              </Link>
            );
          })}

          <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
            <SheetTrigger asChild>
              <button
                className="flex-1 flex flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1.5 transition-colors"
                style={{
                  color: moreActive ? "var(--primary)" : "var(--muted-foreground)",
                  background: moreActive ? "color-mix(in oklab, var(--primary) 10%, transparent)" : "transparent",
                }}
                aria-label="More menu"
              >
                <MoreHorizontal className="size-[18px]" />
                <span className="text-[10px] font-medium leading-none">More</span>
              </button>
            </SheetTrigger>
            <SheetContent
              side="bottom"
              className="rounded-t-2xl border-border bg-background pb-[max(env(safe-area-inset-bottom),16px)]"
            >
              <SheetHeader className="text-left">
                <SheetTitle className="text-base">Quanta Terminal</SheetTitle>
              </SheetHeader>
              <div className="grid grid-cols-2 gap-2 mt-3">
                {MORE_ITEMS.map(({ to, icon: Icon, label }) => {
                  const active = path.startsWith(to);
                  return (
                    <Link
                      key={to}
                      to={to}
                      onClick={() => setMoreOpen(false)}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-3 border border-border bg-card/50 transition-colors active:scale-[0.98]"
                      style={{
                        color: active ? "var(--primary)" : "var(--foreground)",
                      }}
                    >
                      <Icon className="size-[18px] shrink-0" />
                      <span className="text-[13.5px] font-medium truncate">{label}</span>
                    </Link>
                  );
                })}
              </div>
              <button
                onClick={() => { setMoreOpen(false); signOut(); nav({ to: "/auth" }); }}
                className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl px-3 py-3 border border-border text-[13.5px] font-medium text-muted-foreground active:scale-[0.98]"
              >
                <LogOut className="size-4" /> Sign out
              </button>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </nav>
  );
}
