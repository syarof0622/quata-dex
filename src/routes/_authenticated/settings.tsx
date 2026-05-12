import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { getPaperAccount, resetPaperAccount } from "@/lib/paper.functions";
import { checkAlerts } from "@/lib/alerts.functions";
import { toast } from "sonner";
import { LogOut, RefreshCw, Bell, Palette, User, Database, Zap, Trash2, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Settings — Quanta Terminal" }] }),
  component: SettingsPage,
});

type Prefs = {
  theme: "dark" | "light" | "system";
  defaultMarket: "idx" | "us" | "global";
  defaultTimeframe: string;
  refreshInterval: number;
  notifyTriggers: boolean;
  notifyDesktop: boolean;
  newsLang: "en" | "id";
};

const DEFAULT_PREFS: Prefs = {
  theme: "dark",
  defaultMarket: "idx",
  defaultTimeframe: "D",
  refreshInterval: 30,
  notifyTriggers: true,
  notifyDesktop: false,
  newsLang: "en",
};

function loadPrefs(): Prefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem("quanta:prefs");
    return raw ? { ...DEFAULT_PREFS, ...JSON.parse(raw) } : DEFAULT_PREFS;
  } catch { return DEFAULT_PREFS; }
}

function applyTheme(t: Prefs["theme"]) {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const useDark = t === "dark" || (t === "system" && sysDark);
  root.classList.toggle("dark", useDark);
}

function SettingsPage() {
  const { user, signOut } = useAuth();
  const qc = useQueryClient();
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [displayName, setDisplayName] = useState(
    (user?.user_metadata as any)?.full_name ?? "",
  );
  const [savingProfile, setSavingProfile] = useState(false);
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");

  const account = useQuery({ queryKey: ["paper-account-settings"], queryFn: () => getPaperAccount() });

  useEffect(() => { applyTheme(prefs.theme); }, [prefs.theme]);

  function update<K extends keyof Prefs>(k: K, v: Prefs[K]) {
    const next = { ...prefs, [k]: v };
    setPrefs(next);
    try { localStorage.setItem("quanta:prefs", JSON.stringify(next)); } catch {/* */}
    if (k === "theme") applyTheme(v as Prefs["theme"]);
  }

  const [resetAmount, setResetAmount] = useState("100000");
  const reset = useMutation({
    mutationFn: (cash: number) => resetPaperAccount({ data: { cash } }),
    onSuccess: (_r, cash) => {
      toast.success(`Paper account reset to $${cash.toLocaleString()}`);
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e?.message ?? "Reset failed"),
  });

  const scan = useMutation({
    mutationFn: () => checkAlerts(),
    onSuccess: (r: any) => {
      const list = Array.isArray(r?.triggered) ? r.triggered : [];
      if (!list.length) toast.message("No alerts triggered.");
      else list.forEach((t: any) => toast.success(`${t.symbol}: ${t.reason}`));
    },
  });

  async function saveProfile() {
    setSavingProfile(true);
    const { error } = await supabase.auth.updateUser({ data: { full_name: displayName } });
    setSavingProfile(false);
    if (error) toast.error(error.message);
    else toast.success("Profile saved");
  }

  async function changePassword() {
    if (pwd.length < 8) return toast.error("Password must be ≥ 8 characters");
    if (pwd !== pwd2) return toast.error("Passwords do not match");
    const { error } = await supabase.auth.updateUser({ password: pwd });
    if (error) toast.error(error.message);
    else { toast.success("Password updated"); setPwd(""); setPwd2(""); }
  }

  async function requestDesktopPerm(v: boolean) {
    update("notifyDesktop", v);
    if (v && typeof Notification !== "undefined" && Notification.permission !== "granted") {
      const p = await Notification.requestPermission();
      if (p !== "granted") { update("notifyDesktop", false); toast.error("Notification permission denied"); }
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Profile, preferences, paper account & data integrations.</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile"><User className="size-4 mr-1" /> Profile</TabsTrigger>
          <TabsTrigger value="appearance"><Palette className="size-4 mr-1" /> Appearance</TabsTrigger>
          <TabsTrigger value="trading"><Zap className="size-4 mr-1" /> Trading</TabsTrigger>
          <TabsTrigger value="notifications"><Bell className="size-4 mr-1" /> Notifications</TabsTrigger>
          <TabsTrigger value="data"><Database className="size-4 mr-1" /> Data</TabsTrigger>
        </TabsList>

        {/* PROFILE */}
        <TabsContent value="profile" className="space-y-3 mt-3">
          <div className="panel p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="size-12 rounded-full bg-primary/15 grid place-items-center text-primary font-semibold">
                {(displayName || user?.email || "?").slice(0, 1).toUpperCase()}
              </div>
              <div>
                <div className="font-semibold">{displayName || "Trader"}</div>
                <div className="text-xs text-muted-foreground flex items-center gap-1"><Mail className="size-3" /> {user?.email}</div>
              </div>
            </div>
            <div>
              <Label>Display name</Label>
              <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="Your name" />
            </div>
            <Button onClick={saveProfile} disabled={savingProfile}>{savingProfile ? "Saving…" : "Save profile"}</Button>
          </div>

          <div className="panel p-4 space-y-3">
            <h3 className="font-semibold">Change password</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <div><Label>New password</Label><Input type="password" value={pwd} onChange={e => setPwd(e.target.value)} /></div>
              <div><Label>Confirm</Label><Input type="password" value={pwd2} onChange={e => setPwd2(e.target.value)} /></div>
            </div>
            <Button onClick={changePassword} variant="outline">Update password</Button>
          </div>

          <div className="panel p-4 flex items-center justify-between">
            <div>
              <div className="font-semibold">Sign out</div>
              <div className="text-xs text-muted-foreground">End this session on this device.</div>
            </div>
            <Button variant="destructive" onClick={() => signOut()}><LogOut className="size-4 mr-1" /> Sign out</Button>
          </div>
        </TabsContent>

        {/* APPEARANCE */}
        <TabsContent value="appearance" className="space-y-3 mt-3">
          <div className="panel p-4 space-y-3">
            <Row label="Theme" hint="Light / dark / follow system">
              <Select value={prefs.theme} onValueChange={(v) => update("theme", v as Prefs["theme"])}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dark">Dark</SelectItem>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                </SelectContent>
              </Select>
            </Row>
            <Row label="News language" hint="Filters Yahoo Finance news feed">
              <Select value={prefs.newsLang} onValueChange={(v) => update("newsLang", v as Prefs["newsLang"])}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="id">Bahasa Indonesia</SelectItem>
                </SelectContent>
              </Select>
            </Row>
          </div>
        </TabsContent>

        {/* TRADING */}
        <TabsContent value="trading" className="space-y-3 mt-3">
          <div className="panel p-4 space-y-3">
            <Row label="Default market" hint="Used on Market & Screener pages">
              <Select value={prefs.defaultMarket} onValueChange={(v) => update("defaultMarket", v as Prefs["defaultMarket"])}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="idx">🇮🇩 IDX</SelectItem>
                  <SelectItem value="us">🇺🇸 US</SelectItem>
                  <SelectItem value="global">🌐 Global</SelectItem>
                </SelectContent>
              </Select>
            </Row>
            <Row label="Default timeframe" hint="Chart timeframe on first load">
              <Select value={prefs.defaultTimeframe} onValueChange={(v) => update("defaultTimeframe", v)}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["5","15","60","240","D","W"].map(tf => <SelectItem key={tf} value={tf}>{tf}</SelectItem>)}
                </SelectContent>
              </Select>
            </Row>
            <Row label="Auto-refresh (sec)" hint="Quotes & screener polling interval">
              <Input type="number" className="w-32" value={prefs.refreshInterval}
                onChange={e => update("refreshInterval", Math.max(5, Number(e.target.value) || 30))} />
            </Row>
          </div>

          <div className="panel p-4 space-y-2">
            <h3 className="font-semibold flex items-center gap-2"><RefreshCw className="size-4" /> Paper Trading Account</h3>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <Mini label="Cash" value={fmt(account.data?.account?.cash)} />
              <Mini label="Positions" value={String(account.data?.positions?.length ?? 0)} />
              <Mini label="Open orders" value={String(account.data?.pending?.length ?? 0)} />
            </div>
            <div className="flex items-center justify-between pt-2">
              <div className="text-xs text-muted-foreground">Wipes all positions, orders and journal entries; cash returns to $100,000.</div>
              <Button variant="destructive" onClick={() => {
                if (confirm("Reset paper account? This cannot be undone.")) reset.mutate();
              }} disabled={reset.isPending}>
                <Trash2 className="size-4 mr-1" /> Reset paper account
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* NOTIFICATIONS */}
        <TabsContent value="notifications" className="space-y-3 mt-3">
          <div className="panel p-4 space-y-3">
            <Row label="Toast on alert trigger" hint="Show toast when an alert fires">
              <Switch checked={prefs.notifyTriggers} onCheckedChange={(v) => update("notifyTriggers", v)} />
            </Row>
            <Row label="Desktop notifications" hint="Browser notifications even when tab is in the background">
              <Switch checked={prefs.notifyDesktop} onCheckedChange={requestDesktopPerm} />
            </Row>
            <div className="border-t border-border pt-3 flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Run an alert scan now to test your rules.</div>
              <Button variant="outline" onClick={() => scan.mutate()} disabled={scan.isPending}>
                <Zap className="size-4 mr-1" /> {scan.isPending ? "Scanning…" : "Run scan"}
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* DATA */}
        <TabsContent value="data" className="space-y-3 mt-3">
          <div className="panel p-4 space-y-2">
            <h3 className="font-semibold">Data sources</h3>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Quotes & candles · <span className="text-foreground">Yahoo Finance</span> (cached 8–30s)</li>
              <li>• Charts · <span className="text-foreground">TradingView</span> embed widget</li>
              <li>• AI Analyst · <span className="text-foreground">Lovable AI Gateway</span></li>
              <li>• Persistence · <span className="text-foreground">Lovable Cloud (Supabase)</span></li>
            </ul>
          </div>
          <div className="panel p-4 space-y-2">
            <h3 className="font-semibold">User ID</h3>
            <code className="text-xs font-mono break-all bg-accent/40 p-2 rounded block">{user?.id}</code>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel-2 p-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="font-mono text-base">{value}</div>
    </div>
  );
}

function fmt(n: any) {
  if (n == null) return "—";
  const v = Number(n);
  return isFinite(v) ? "$" + v.toLocaleString(undefined, { maximumFractionDigits: 2 }) : "—";
}
