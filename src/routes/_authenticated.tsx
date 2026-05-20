import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarMenu,
  SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, SidebarHeader, SidebarFooter,
} from "@/components/ui/sidebar";
import { Activity, Bell, Bot, FlaskConical, LayoutDashboard, Newspaper, PieChart, Settings, SlidersHorizontal, Star, TrendingUp, LogOut, Sparkles } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { TickerSearch } from "@/components/TickerSearch";
import { OnboardingDialog } from "@/components/OnboardingDialog";

export const Route = createFileRoute("/_authenticated")({
  component: AuthedLayout,
});

const NAV = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/market", icon: TrendingUp, label: "Market" },
  { to: "/screener", icon: SlidersHorizontal, label: "Screener" },
  { to: "/watchlist", icon: Star, label: "Watchlist" },
  { to: "/portfolio", icon: PieChart, label: "Portfolio" },
  { to: "/ai", icon: Bot, label: "AI Analyst" },
  { to: "/lab", icon: FlaskConical, label: "Simulation Lab" },
  { to: "/expert", icon: Sparkles, label: "Expert Tools" },
  { to: "/news", icon: Newspaper, label: "News" },
  { to: "/alerts", icon: Bell, label: "Alerts" },
  { to: "/settings", icon: Settings, label: "Settings" },
] as const;

function AuthedLayout() {
  const { signOut } = useAuth();
  const nav = useNavigate();
  const path = useRouterState({ select: s => s.location.pathname });

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
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

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b border-border flex items-center gap-3 px-3">
            <SidebarTrigger />
            <TickerSearch className="flex-1 max-w-xl" />
            <div className="hidden md:flex items-center gap-3 ml-auto">
              <span className="flex items-center gap-2 text-xs text-muted-foreground panel px-2.5 py-1">
                <span className="pulse-dot" /> Markets · live
              </span>
              <Button size="sm" variant="outline" asChild><Link to="/ai"><Bot className="size-4" /> AI</Link></Button>
            </div>
          </header>
          <main className="flex-1 min-w-0 overflow-auto"><Outlet /></main>
        </div>
      </div>
    </SidebarProvider>
  );
}
