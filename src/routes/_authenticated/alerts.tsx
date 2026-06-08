import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listAlerts, createAlert, deleteAlert, checkAlerts, toggleAlert, evaluateAlert,
  type AlertRule,
} from "@/lib/alerts.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Trash2, Bell, Zap, Target } from "lucide-react";
import { formatDateTimeWIB } from "@/lib/format";
import { PageHero } from "@/components/ui/page-hero";
import { useLang } from "@/hooks/use-language";

import { seoHead } from "@/lib/seo-head";

export const Route = createFileRoute("/_authenticated/alerts")({
  head: () => ({
    ...seoHead({
      path: "/alerts",
      title: "Smart Alerts — Quanta Terminal",
      description: "Configure price, volume, and AI-driven smart-money alerts for your IDX watchlist with realtime delivery.",
      noindex: true,
    }),
  }),
  component: AlertsPage,
});

type RuleKind = AlertRule["kind"];


function AlertsPage() {
  const { L } = useLang();
  const qc = useQueryClient();
  const alerts = useQuery({ queryKey: ["alerts"], queryFn: () => listAlerts() });
  const alertRows: any[] = Array.isArray(alerts.data) ? alerts.data : [];

  const [symbol, setSymbol] = useState("AAPL");
  const [kind, setKind] = useState<RuleKind>("price_above");
  const [value, setValue] = useState("200");
  const [fast, setFast] = useState("12");
  const [slow, setSlow] = useState("26");
  const [lookback, setLookback] = useState("20");

  const buildRule = (): AlertRule => {
    if (kind === "ema_cross") return { kind, fast: Number(fast), slow: Number(slow) };
    if (kind === "volume_spike") return { kind, multiplier: Number(value) };
    if (kind === "breakout" || kind === "breakdown") return { kind, lookback: Number(lookback) };
    if (kind === "setup_long_ready" || kind === "setup_short_ready" || kind === "breakout_confirmed") return { kind };
    if (kind === "pullback_to_support") return { kind, tolerancePct: Number(value) || 1.5 };
    return { kind, value: Number(value) } as AlertRule;
  };

  // Live preview of current value vs target
  const previewKey = useMemo(
    () => ["alert-preview", symbol.toUpperCase(), kind, value, fast, slow, lookback].join("|"),
    [symbol, kind, value, fast, slow, lookback],
  );
  const preview = useQuery({
    queryKey: [previewKey],
    queryFn: () => evaluateAlert({ data: { symbol: symbol.toUpperCase(), rule: buildRule() } }),
    enabled: symbol.length >= 1,
    refetchInterval: 30_000,
  });

  const create = useMutation({
    mutationFn: () => createAlert({ data: { symbol: symbol.toUpperCase(), rule: buildRule() } }),
    onSuccess: () => { toast.success(L.tools.alerts.created); qc.invalidateQueries({ queryKey: ["alerts"] }); },
    onError: (e: Error) => toast.error(e?.message ?? L.tools.alerts.failed),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteAlert({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });
  const toggle = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => toggleAlert({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });
  const check = useMutation({
    mutationFn: () => checkAlerts(),
    onSuccess: (r: any) => {
      const list = Array.isArray(r?.triggered) ? r.triggered : [];
      if (!list.length) toast.message(L.tools.alerts.noneTriggered);
      else list.forEach((t: any) => toast.success(`${t.symbol}: ${t.reason}`));
      qc.invalidateQueries({ queryKey: ["alerts"] });
    },
  });

  const isPriceLike = kind === "price_above" || kind === "price_below";
  const isRsi = kind === "rsi_above" || kind === "rsi_below";
  const isScore = kind === "score_above" || kind === "score_below";

  const KIND_LABEL: Record<RuleKind, string> = {
    price_above: L.tools.alerts.kPriceAbove,
    price_below: L.tools.alerts.kPriceBelow,
    rsi_above: L.tools.alerts.kRsiAbove,
    rsi_below: L.tools.alerts.kRsiBelow,
    ema_cross: L.tools.alerts.kEmaCross,
    volume_spike: L.tools.alerts.kVolSpike,
    breakout: L.tools.alerts.kBreakout,
    breakdown: L.tools.alerts.kBreakdown,
    score_above: L.tools.alerts.kScoreAbove,
    score_below: L.tools.alerts.kScoreBelow,
    setup_long_ready: L.tools.alerts.kSetupLong,
    setup_short_ready: L.tools.alerts.kSetupShort,
    pullback_to_support: L.tools.alerts.kPullback,
    breakout_confirmed: L.tools.alerts.kBreakoutConf,
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <PageHero
        eyebrow={L.hero.alerts.eyebrow}
        icon={Bell}
        title={L.hero.alerts.title}
        subtitle={L.hero.alerts.subtitle}
        actions={
          <Button onClick={() => check.mutate()} disabled={check.isPending} variant="outline">
            <Zap className="size-4 mr-1" /> {check.isPending ? L.tools.alerts.scanning : L.tools.alerts.runScan}
          </Button>
        }
      />


      <div className="panel p-4 space-y-3">
        <div className="grid md:grid-cols-6 gap-2 items-end">
          <div className="col-span-1">
            <label className="text-xs text-muted-foreground">{L.tools.alerts.symbol}</label>
            <Input value={symbol} onChange={e => setSymbol(e.target.value)} placeholder="AAPL" />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-muted-foreground">{L.tools.alerts.trigger}</label>
            <Select value={kind} onValueChange={(v) => setKind(v as RuleKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(KIND_LABEL) as RuleKind[]).map(k => (
                  <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {kind === "ema_cross" ? (
            <>
              <div><label className="text-xs text-muted-foreground">{L.tools.alerts.fastEma}</label><Input value={fast} onChange={e => setFast(e.target.value)} /></div>
              <div><label className="text-xs text-muted-foreground">{L.tools.alerts.slowEma}</label><Input value={slow} onChange={e => setSlow(e.target.value)} /></div>
            </>
          ) : kind === "breakout" || kind === "breakdown" ? (
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">{L.tools.alerts.lookbackDays}</label>
              <Input value={lookback} onChange={e => setLookback(e.target.value)} />
            </div>
          ) : kind === "setup_long_ready" || kind === "setup_short_ready" || kind === "breakout_confirmed" ? (
            <div className="col-span-2 text-xs text-muted-foreground self-end pb-2">
              {L.tools.alerts.noThreshold}
            </div>
          ) : kind === "pullback_to_support" ? (
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">{L.tools.alerts.toleranceLabel}</label>
              <Input value={value} onChange={e => setValue(e.target.value)} placeholder="1.5" />
            </div>
          ) : (
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">
                {kind === "volume_spike" ? L.tools.alerts.multiplierLabel : isRsi ? L.tools.alerts.rsiThreshold : isScore ? L.tools.alerts.scoreThreshold : L.tools.alerts.price}
              </label>
              <Input value={value} onChange={e => setValue(e.target.value)} />
            </div>
          )}
          <Button onClick={() => create.mutate()} disabled={create.isPending}>{L.tools.alerts.createAlert}</Button>
        </div>

        {/* Live preview */}
        <div className="flex items-center gap-3 text-sm border-t border-border pt-3">
          <Target className="size-4 text-muted-foreground" />
          <div className="text-muted-foreground">{L.tools.alerts.livePreview}</div>
          {preview.isLoading ? (
            <div className="text-muted-foreground">{L.tools.alerts.checking}</div>
          ) : preview.data && preview.data.current != null ? (
            <>
              <div>
                {L.tools.alerts.current} <span className="font-mono text-foreground">{String(preview.data.current)}</span>
                {preview.data.target != null && (
                  <> · {L.tools.alerts.target} <span className="font-mono text-foreground">{String(preview.data.target)}</span></>
                )}
              </div>
              <span className={`text-xs px-2 py-0.5 rounded font-semibold ${preview.data.hit ? "bg-bull-soft text-bull" : "bg-accent/40 text-muted-foreground"}`}>
                {preview.data.hit ? L.tools.alerts.wouldTrigger : L.tools.alerts.armed}
              </span>
            </>
          ) : (
            <div className="text-muted-foreground">{L.tools.alerts.needMoreData}</div>
          )}
        </div>
      </div>

      <div className="panel p-2 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="text-left p-2">{L.tools.alerts.thSymbol}</th>
              <th className="text-left p-2">{L.tools.alerts.thRule}</th>
              <th className="text-left p-2">{L.tools.alerts.thStatus}</th>
              <th className="text-left p-2">{L.tools.alerts.thCreated}</th>
              <th className="text-center p-2">{L.tools.alerts.thActive}</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {alertRows.map((a) => (
              <tr key={a.id} className="border-t border-border">
                <td className="p-2 font-medium">{a.symbol}</td>
                <td className="p-2 font-mono text-xs">{describeRule(a.rule_json as AlertRule)}</td>
                <td className="p-2 text-xs">
                  {a.triggered_at
                    ? <span className="text-bull">✓ {L.tools.alerts.triggered} {formatDateTimeWIB(a.triggered_at)}</span>
                    : a.active ? <span className="text-muted-foreground">{L.tools.alerts.armed}</span> : <span className="text-muted-foreground">{L.tools.alerts.paused}</span>}
                </td>
                <td className="p-2 text-xs text-muted-foreground">{formatDateTimeWIB(a.created_at)}</td>
                <td className="p-2 text-center">
                  <Switch checked={!!a.active} onCheckedChange={(v) => toggle.mutate({ id: a.id, active: v })} />
                </td>
                <td className="p-2 text-right">
                  <Button size="icon" variant="ghost" onClick={() => del.mutate(a.id)}><Trash2 className="size-4" /></Button>
                </td>
              </tr>
            ))}
            {!alertRows.length && (
              <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">{L.tools.alerts.noAlerts}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function describeRule(r: AlertRule | null | undefined): string {
  if (!r?.kind) return "—";
  switch (r.kind) {
    case "price_above": return `price > ${r.value}`;
    case "price_below": return `price < ${r.value}`;
    case "rsi_above": return `RSI(14) > ${r.value}`;
    case "rsi_below": return `RSI(14) < ${r.value}`;
    case "ema_cross": return `EMA${r.fast} × EMA${r.slow}`;
    case "volume_spike": return `volume > ${r.multiplier}× avg`;
    case "breakout": return `close > ${r.lookback}d high`;
    case "breakdown": return `close < ${r.lookback}d low`;
    case "score_above": return `AI score > ${r.value}`;
    case "score_below": return `AI score < ${r.value}`;
    case "setup_long_ready": return `BUY setup → Ready to Trade`;
    case "setup_short_ready": return `SELL setup → Ready to Trade`;
    case "pullback_to_support": return `BUY pullback within ${r.tolerancePct ?? 1.5}% of 20d support`;
    case "breakout_confirmed": return `Confirmed BUY breakout (20d high + ≥1.3× vol)`;
  }
}
