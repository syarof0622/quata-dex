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

export const Route = createFileRoute("/_authenticated/alerts")({
  head: () => ({ meta: [{ title: "Smart Alerts — Quanta Terminal" }] }),
  component: AlertsPage,
});

type RuleKind = AlertRule["kind"];

const KIND_LABEL: Record<RuleKind, string> = {
  price_above: "Price above",
  price_below: "Price below",
  rsi_above: "RSI(14) above",
  rsi_below: "RSI(14) below",
  ema_cross: "EMA cross",
  volume_spike: "Volume spike (×avg)",
  breakout: "Breakout (N-day high)",
  breakdown: "Breakdown (N-day low)",
  score_above: "AI Signal score above",
  score_below: "AI Signal score below",
  setup_long_ready: "Setup: LONG ready to trade",
  setup_short_ready: "Setup: SHORT ready to trade",
  pullback_to_support: "Setup: pullback to 20d support (BUY bias)",
  breakout_confirmed: "Setup: confirmed breakout (BUY + volume)",
};

function AlertsPage() {
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
    onSuccess: () => { toast.success("Alert created"); qc.invalidateQueries({ queryKey: ["alerts"] }); },
    onError: (e: Error) => toast.error(e?.message ?? "Failed"),
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
    onSuccess: (r) => {
      if (!r.triggered.length) toast.message("No alerts triggered.");
      else r.triggered.forEach((t) => toast.success(`${t.symbol}: ${t.reason}`));
      qc.invalidateQueries({ queryKey: ["alerts"] });
    },
  });

  const isPriceLike = kind === "price_above" || kind === "price_below";
  const isRsi = kind === "rsi_above" || kind === "rsi_below";
  const isScore = kind === "score_above" || kind === "score_below";

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><Bell className="size-5 text-primary" /> Smart Alerts</h1>
          <p className="text-sm text-muted-foreground">Price, RSI, EMA cross, volume spike, N-day breakouts, and AI Signal score crossings.</p>
        </div>
        <Button onClick={() => check.mutate()} disabled={check.isPending} variant="outline">
          <Zap className="size-4 mr-1" /> {check.isPending ? "Scanning…" : "Run scan now"}
        </Button>
      </div>

      <div className="panel p-4 space-y-3">
        <div className="grid md:grid-cols-6 gap-2 items-end">
          <div className="col-span-1">
            <label className="text-xs text-muted-foreground">Symbol</label>
            <Input value={symbol} onChange={e => setSymbol(e.target.value)} placeholder="AAPL" />
          </div>
          <div className="col-span-2">
            <label className="text-xs text-muted-foreground">Trigger</label>
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
              <div><label className="text-xs text-muted-foreground">Fast EMA</label><Input value={fast} onChange={e => setFast(e.target.value)} /></div>
              <div><label className="text-xs text-muted-foreground">Slow EMA</label><Input value={slow} onChange={e => setSlow(e.target.value)} /></div>
            </>
          ) : kind === "breakout" || kind === "breakdown" ? (
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Lookback (days)</label>
              <Input value={lookback} onChange={e => setLookback(e.target.value)} />
            </div>
          ) : (
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">
                {kind === "volume_spike" ? "Multiplier (×avg vol)" : isRsi ? "RSI threshold (0–100)" : isScore ? "Score threshold (-100…100)" : "Price"}
              </label>
              <Input value={value} onChange={e => setValue(e.target.value)} />
            </div>
          )}
          <Button onClick={() => create.mutate()} disabled={create.isPending}>Create alert</Button>
        </div>

        {/* Live preview */}
        <div className="flex items-center gap-3 text-sm border-t border-border pt-3">
          <Target className="size-4 text-muted-foreground" />
          <div className="text-muted-foreground">Live preview:</div>
          {preview.isLoading ? (
            <div className="text-muted-foreground">checking…</div>
          ) : preview.data && preview.data.current != null ? (
            <>
              <div>
                Current <span className="font-mono text-foreground">{String(preview.data.current)}</span>
                {preview.data.target != null && (
                  <> · target <span className="font-mono text-foreground">{String(preview.data.target)}</span></>
                )}
              </div>
              <span className={`text-xs px-2 py-0.5 rounded font-semibold ${preview.data.hit ? "bg-bull-soft text-bull" : "bg-accent/40 text-muted-foreground"}`}>
                {preview.data.hit ? "WOULD TRIGGER" : "armed"}
              </span>
            </>
          ) : (
            <div className="text-muted-foreground">Need more data — try a different symbol or trigger.</div>
          )}
        </div>
      </div>

      <div className="panel p-2 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="text-left p-2">Symbol</th>
              <th className="text-left p-2">Rule</th>
              <th className="text-left p-2">Status</th>
              <th className="text-left p-2">Created</th>
              <th className="text-center p-2">Active</th>
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
                    ? <span className="text-bull">✓ triggered {new Date(a.triggered_at).toLocaleString()}</span>
                    : a.active ? <span className="text-muted-foreground">armed</span> : <span className="text-muted-foreground">paused</span>}
                </td>
                <td className="p-2 text-xs text-muted-foreground">{a.created_at ? new Date(a.created_at).toLocaleString() : ""}</td>
                <td className="p-2 text-center">
                  <Switch checked={!!a.active} onCheckedChange={(v) => toggle.mutate({ id: a.id, active: v })} />
                </td>
                <td className="p-2 text-right">
                  <Button size="icon" variant="ghost" onClick={() => del.mutate(a.id)}><Trash2 className="size-4" /></Button>
                </td>
              </tr>
            ))}
            {!alertRows.length && (
              <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No alerts yet. Create one above.</td></tr>
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
  }
}
