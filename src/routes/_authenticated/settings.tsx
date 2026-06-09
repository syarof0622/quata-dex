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
import { getPaperAccount, resetPaperAccount, updatePaperCurrency } from "@/lib/paper.functions";
import { formatIDRCompact } from "@/lib/format";
import { checkAlerts } from "@/lib/alerts.functions";
import { toast } from "sonner";
import { LogOut, RefreshCw, Bell, Palette, User, Database, Zap, Trash2, Mail, Wallet, Bot } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHero } from "@/components/ui/page-hero";
import { Settings as SettingsIcon } from "lucide-react";
import { PaperBalanceCard } from "@/components/PaperBalanceCard";
import { AiSettingsCard } from "@/components/AiSettingsCard";
import { useLang } from "@/hooks/use-language";

import { seoHead } from "@/lib/seo-head";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    ...seoHead({
      path: "/settings",
      title: "Settings — Quanta Terminal",
      description: "Manage account preferences, language, AI agent configuration, and notification settings for Quanta Terminal.",
      noindex: true,
    }),
  }),
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
  const { lang, setLang, L } = useLang();
  const S = L.body.settings;
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

  const accountCurrency: "IDR" | "USD" = (account.data?.account?.currency ?? "IDR") as "IDR" | "USD";
  const [currency, setCurrency] = useState<"IDR" | "USD">(accountCurrency);
  useEffect(() => { setCurrency(accountCurrency); }, [accountCurrency]);

  const defaultAmt = accountCurrency === "IDR" ? "100000000" : "100000";
  const [resetAmount, setResetAmount] = useState(defaultAmt);
  useEffect(() => { setResetAmount(accountCurrency === "IDR" ? "100000000" : "100000"); }, [accountCurrency]);

  const reset = useMutation({
    mutationFn: (cash: number) => resetPaperAccount({ data: { cash, currency } }),
    onSuccess: (_r, cash) => {
      const sym = currency === "IDR" ? "Rp " : "$";
      toast.success(S.resetSuccess.replace("{amt}", `${sym}${cash.toLocaleString()}`));
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e?.message ?? S.resetFailed),
  });

  const curMut = useMutation({
    mutationFn: (c: "IDR" | "USD") => updatePaperCurrency({ data: { currency: c } }),
    onSuccess: (_r, c) => { toast.success(`${S.currencyToast} ${c}`); qc.invalidateQueries(); },
    onError: (e: Error) => toast.error(e?.message ?? S.resetFailed),
  });

  const scan = useMutation({
    mutationFn: () => checkAlerts(),
    onSuccess: (r: any) => {
      const list = Array.isArray(r?.triggered) ? r.triggered : [];
      if (!list.length) toast.message(S.noAlerts);
      else list.forEach((t: any) => toast.success(`${t.symbol}: ${t.reason}`));
    },
  });

  async function saveProfile() {
    setSavingProfile(true);
    const { error } = await supabase.auth.updateUser({ data: { full_name: displayName } });
    setSavingProfile(false);
    if (error) toast.error(error.message);
    else toast.success(S.profileSaved);
  }

  async function changePassword() {
    if (pwd.length < 8) return toast.error(S.pwdMin);
    if (pwd !== pwd2) return toast.error(S.pwdMismatch);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    if (error) toast.error(error.message);
    else { toast.success(S.passwordUpdated); setPwd(""); setPwd2(""); }
  }

  async function requestDesktopPerm(v: boolean) {
    update("notifyDesktop", v);
    if (v && typeof Notification !== "undefined" && Notification.permission !== "granted") {
      const p = await Notification.requestPermission();
      if (p !== "granted") { update("notifyDesktop", false); toast.error(S.notifDenied); }
    }
  }



  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl">
      <PageHero
        eyebrow={S.eyebrow}
        icon={SettingsIcon}
        title={S.title}
        subtitle={S.subtitle}
      />


      <Tabs defaultValue="profile">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="profile"><User className="size-4 mr-1" /> {S.tabProfile}</TabsTrigger>
          <TabsTrigger value="paper"><Wallet className="size-4 mr-1" /> {S.tabPaper}</TabsTrigger>
          <TabsTrigger value="ai"><Bot className="size-4 mr-1" /> {S.tabAi}</TabsTrigger>
          <TabsTrigger value="appearance"><Palette className="size-4 mr-1" /> {S.tabAppearance}</TabsTrigger>
          <TabsTrigger value="trading"><Zap className="size-4 mr-1" /> {S.tabTrading}</TabsTrigger>
          <TabsTrigger value="notifications"><Bell className="size-4 mr-1" /> {S.tabNotifications}</TabsTrigger>
          <TabsTrigger value="data"><Database className="size-4 mr-1" /> {S.tabData}</TabsTrigger>
        </TabsList>

        <TabsContent value="paper" className="space-y-3 mt-3"><PaperBalanceCard /></TabsContent>
        <TabsContent value="ai" className="space-y-3 mt-3"><AiSettingsCard /></TabsContent>

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
              <Label>{S.displayName}</Label>
              <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder={S.yourName} />
            </div>
            <Button onClick={saveProfile} disabled={savingProfile}>{savingProfile ? S.saving : S.saveProfile}</Button>
          </div>

          <div className="panel p-4 space-y-3">
            <h2 className="font-semibold">{S.changePassword}</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <div><Label>{S.newPassword}</Label><Input type="password" value={pwd} onChange={e => setPwd(e.target.value)} /></div>
              <div><Label>{S.confirm}</Label><Input type="password" value={pwd2} onChange={e => setPwd2(e.target.value)} /></div>
            </div>
            <Button onClick={changePassword} variant="outline">{S.updatePassword}</Button>
          </div>

          <div className="panel p-4 flex items-center justify-between">
            <div>
              <div className="font-semibold">{S.signOut}</div>
              <div className="text-xs text-muted-foreground">{S.signOutHint}</div>
            </div>
            <Button variant="destructive" onClick={() => signOut()}><LogOut className="size-4 mr-1" /> {S.signOut}</Button>
          </div>
        </TabsContent>

        {/* APPEARANCE */}
        <TabsContent value="appearance" className="space-y-3 mt-3">
          <div className="panel p-4 space-y-3">
            <Row label={S.theme} hint={S.themeHint}>
              <Select value={prefs.theme} onValueChange={(v) => update("theme", v as Prefs["theme"])}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dark">{S.themeDark}</SelectItem>
                  <SelectItem value="light">{S.themeLight}</SelectItem>
                  <SelectItem value="system">{S.themeSystem}</SelectItem>
                </SelectContent>
              </Select>
            </Row>
            <Row label={S.systemLanguage} hint={S.systemLanguageHintEn}>
              <Select value={lang} onValueChange={(v) => { setLang(v as "id" | "en"); update("newsLang", v as Prefs["newsLang"]); }}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="id">🇮🇩 Bahasa Indonesia</SelectItem>
                  <SelectItem value="en">🇬🇧 English</SelectItem>
                </SelectContent>
              </Select>
            </Row>
          </div>
        </TabsContent>

        {/* TRADING */}
        <TabsContent value="trading" className="space-y-3 mt-3">
          <div className="panel p-4 space-y-3">
            <Row label={S.defaultMarket} hint={S.defaultMarketHint}>
              <Select value={prefs.defaultMarket} onValueChange={(v) => update("defaultMarket", v as Prefs["defaultMarket"])}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="idx">🇮🇩 IDX</SelectItem>
                  <SelectItem value="us">🇺🇸 US</SelectItem>
                  <SelectItem value="global">🌐 Global</SelectItem>
                </SelectContent>
              </Select>
            </Row>
            <Row label={S.defaultTimeframe} hint={S.defaultTimeframeHint}>
              <Select value={prefs.defaultTimeframe} onValueChange={(v) => update("defaultTimeframe", v)}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["5","15","60","240","D","W"].map(tf => <SelectItem key={tf} value={tf}>{tf}</SelectItem>)}
                </SelectContent>
              </Select>
            </Row>
            <Row label={S.autoRefresh} hint={S.autoRefreshHint}>
              <Input type="number" className="w-32" value={prefs.refreshInterval}
                onChange={e => update("refreshInterval", Math.max(5, Number(e.target.value) || 30))} />
            </Row>
          </div>

          <div className="panel p-4 space-y-3">
            <h2 className="font-semibold flex items-center gap-2"><RefreshCw className="size-4" /> {S.paperAccount}</h2>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <Mini label={`${S.cashLabel} (${accountCurrency})`} value={accountCurrency === "IDR" ? formatIDRCompact(Number(account.data?.account?.cash ?? 0)) : fmt(account.data?.account?.cash)} />
              <Mini label={S.positions} value={String(account.data?.positions?.length ?? 0)} />
              <Mini label={S.openOrders} value={String(account.data?.pending?.length ?? 0)} />
            </div>

            <Row label={S.accountCurrency} hint={S.accountCurrencyHint}>
              <Select value={currency} onValueChange={(v) => { const c = v as "IDR" | "USD"; setCurrency(c); curMut.mutate(c); }}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="IDR">🇮🇩 IDR (Rp)</SelectItem>
                  <SelectItem value="USD">🇺🇸 USD ($)</SelectItem>
                </SelectContent>
              </Select>
            </Row>

            <div className="border-t border-border pt-3 space-y-2">
              <div className="text-xs text-muted-foreground">{S.resetHint}</div>
              <div className="flex items-end gap-2 flex-wrap">
                <div>
                  <Label className="text-[11px]">{S.startingBalance} ({currency === "IDR" ? "Rp" : "$"})</Label>
                  <Input type="number" min="0" className="w-48" value={resetAmount} onChange={e => setResetAmount(e.target.value)} />
                </div>
                <div className="flex flex-wrap gap-1">
                  {(currency === "IDR"
                    ? [10_000_000, 50_000_000, 100_000_000, 500_000_000, 1_000_000_000]
                    : [10_000, 50_000, 100_000, 500_000, 1_000_000]
                  ).map(v => (
                    <Button key={v} size="sm" variant="ghost" onClick={() => setResetAmount(String(v))}>
                      {currency === "IDR" ? formatIDRCompact(v) : `$${v / 1000}k`}
                    </Button>
                  ))}
                </div>
                <Button variant="destructive" onClick={() => {
                  const cash = Math.max(0, Number(resetAmount) || 0);
                  const sym = currency === "IDR" ? "Rp " : "$";
                  if (confirm(S.resetConfirm.replace("{amt}", `${sym}${cash.toLocaleString()}`))) reset.mutate(cash);
                }} disabled={reset.isPending}>
                  <Trash2 className="size-4 mr-1" /> {reset.isPending ? S.saving : S.resetSave}
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* NOTIFICATIONS */}
        <TabsContent value="notifications" className="space-y-3 mt-3">
          <div className="panel p-4 space-y-3">
            <Row label={S.toastTriggers} hint={S.toastTriggersHint}>
              <Switch checked={prefs.notifyTriggers} onCheckedChange={(v) => update("notifyTriggers", v)} />
            </Row>
            <Row label={S.desktopNotif} hint={S.desktopNotifHint}>
              <Switch checked={prefs.notifyDesktop} onCheckedChange={requestDesktopPerm} />
            </Row>
            <div className="border-t border-border pt-3 flex items-center justify-between">
              <div className="text-sm text-muted-foreground">{S.scanHint}</div>
              <Button variant="outline" onClick={() => scan.mutate()} disabled={scan.isPending}>
                <Zap className="size-4 mr-1" /> {scan.isPending ? S.scanning : S.runScan}
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* DATA */}
        <TabsContent value="data" className="space-y-3 mt-3">
          <div className="panel p-4 space-y-2">
            <h2 className="font-semibold">{S.dataSources}</h2>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Quotes & candles · <span className="text-foreground">Yahoo Finance</span> (cached 8–30s)</li>
              <li>• Charts · <span className="text-foreground">TradingView</span> embed widget</li>
              <li>• AI Analyst · <span className="text-foreground">Lovable AI Gateway</span></li>
              <li>• Persistence · <span className="text-foreground">Lovable Cloud (Supabase)</span></li>
            </ul>
          </div>
          <div className="panel p-4 space-y-2">
            <h2 className="font-semibold">{S.userId}</h2>
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
