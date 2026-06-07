import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarMenu,
  SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, SidebarHeader, SidebarFooter,
} from "@/components/ui/sidebar";
import { Activity, Bell, Bot, FlaskConical, LayoutDashboard, Newspaper, PieChart, Settings, SlidersHorizontal, Star, TrendingUp, LogOut, Sparkles, HeartPulse, Shield } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { TickerSearch } from "@/components/TickerSearch";
import { OnboardingDialog } from "@/components/OnboardingDialog";
import { MobileBottomNav } from "@/components/MobileBottomNav";
import { FloatingAIChat } from "@/components/FloatingAIChat";
import { UI_LABELS_ID } from "@/lib/i18n/id";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  component: AuthedLayoutGate,
});

function AuthedLayoutGate() {
  const { loading, isAuthenticated, profile } = useAuth();
  const nav = useNavigate();
  const path = useRouterState({ select: s => s.location.pathname });
  if (loading) {
    return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Memuat sesi…</div>;
  }
  if (!isAuthenticated) {
    if (typeof window !== "undefined") nav({ to: "/auth" });
    return null;
  }
  if (profile?.must_change_password && path !== "/change-password") {
    if (typeof window !== "undefined") nav({ to: "/change-password" });
    return null;
  }
  return <AuthedLayout />;
}

const L = UI_LABELS_ID.nav;
const NAV = [
  { to: "/dashboard", icon: LayoutDashboard, label: L.dashboard },
  { to: "/market", icon: TrendingUp, label: L.market },
  { to: "/screener", icon: SlidersHorizontal, label: L.screener },
  { to: "/watchlist", icon: Star, label: L.watchlist },
  { to: "/portfolio", icon: PieChart, label: L.portfolio },
  { to: "/ai", icon: Bot, label: L.aiAnalyst },
  { to: "/lab", icon: FlaskConical, label: L.simulationLab },
  { to: "/expert", icon: Sparkles, label: L.expertTools },
  { to: "/news", icon: Newspaper, label: L.news },
  { to: "/alerts", icon: Bell, label: L.alerts },
  { to: "/health", icon: HeartPulse, label: L.systemHealth },
  { to: "/settings", icon: Settings, label: L.settings },
] as const;

const PAGE_TITLES: Record<string, string> = {
  "/dashboard": L.dashboard,
  "/market": L.market,
  "/screener": L.screener,
  "/watchlist": L.watchlist,
  "/portfolio": L.portfolio,
  "/ai": L.aiAnalyst,
  "/lab": L.simulationLab,
  "/expert": L.expertTools,
  "/news": L.news,
  "/alerts": L.alerts,
  "/health": L.systemHealth,
  "/settings": L.settings,
};

function AuthedLayout() {
  const { signOut } = useAuth();
  const nav = useNavigate();
  const path = useRouterState({ select: s => s.location.pathname });
  const pageTitle = Object.entries(PAGE_TITLES).find(([p]) => path.startsWith(p))?.[1] ?? "Quanta.Terminal";

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        {/* Sidebar — desktop/tablet only (hidden on mobile) */}
        <div className="hidden md:contents">
          <Sidebar collapsible="icon">
            <SidebarHeader className="px-3 py-3">
              <Link to="/dashboard" className="flex items-center gap-2">
                <div className="size-7 rounded-md bg-primary/15 grid place-items-center neon-border shrink-0">
                  <Activity className="size-4 text-primary" />
                </div>
                <span className="font-semibold tracking-tight group-data-[collapsible=icon]:hidden">
                  Quanta<span className="text-primary">.</span>Terminal
                </span>
              </Link>
            </SidebarHeader>
            <SidebarContent>
              <SidebarGroup>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {NAV.map(({ to, icon: Icon, label }) => (
                      <SidebarMenuItem key={to}>
                        <SidebarMenuButton asChild isActive={path.startsWith(to)} tooltip={label}>
                          <Link to={to}><Icon className="size-4" /><span>{label}</span></Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            </SidebarContent>
            <SidebarFooter>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={() => { signOut(); nav({ to: "/auth" }); }} tooltip="Sign out">
                    <LogOut className="size-4" /><span>Sign out</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarFooter>
          </Sidebar>
        </div>

        <div className="flex-1 flex flex-col min-w-0 w-full">
          {/* Desktop / tablet header */}
          <header className="hidden md:flex h-14 border-b border-border items-center gap-3 px-3">
            <SidebarTrigger />
            <TickerSearch className="flex-1 max-w-xl" />
            <div className="hidden md:flex items-center gap-3 ml-auto">
              <span className="flex items-center gap-2 text-xs text-muted-foreground panel px-2.5 py-1">
                <span className="pulse-dot" /> Markets · live
              </span>
              <Button size="sm" variant="outline" asChild><Link to="/ai"><Bot className="size-4" /> AI</Link></Button>
            </div>
          </header>

          {/* Mobile header — compact, sticky, safe-area aware */}
          <header
            className="md:hidden sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl flex items-center gap-2 px-3"
            style={{
              paddingTop: "max(env(safe-area-inset-top), 8px)",
              paddingBottom: "8px",
              minHeight: 56,
            }}
          >
            <Link to="/dashboard" className="flex items-center gap-2 shrink-0">
              <div className="size-7 rounded-md bg-primary/15 grid place-items-center neon-border">
                <Activity className="size-4 text-primary" />
              </div>
            </Link>
            <div className="flex-1 min-w-0">
              <div className="text-[13.5px] font-semibold tracking-tight truncate">{pageTitle}</div>
              <div className="text-[10px] text-muted-foreground leading-none flex items-center gap-1.5">
                <span className="pulse-dot" style={{ width: 6, height: 6 }} /> Markets · live
              </div>
            </div>
            <Button size="sm" variant="outline" asChild className="h-8 px-2.5">
              <Link to="/ai"><Bot className="size-4" /></Link>
            </Button>
          </header>

          <main
            key={path}
            className="flex-1 min-w-0 overflow-auto anim-fade-up"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 96px)" }}
          >
            <Outlet />
          </main>
          <OnboardingDialog />
        </div>

        {/* Mobile bottom navigation — hidden on md+ */}
        <MobileBottomNav />

        {/* Floating AI chat — bubble accessible from anywhere */}
        <FloatingAIChat />
      </div>
    </SidebarProvider>
  );
}
