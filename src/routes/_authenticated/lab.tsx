import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { getPaperAccount, cancelOrder } from "@/lib/paper.functions";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { formatPrice, formatIDR, formatIDRCompact, formatPct, colorForChange } from "@/lib/format";
import { resetPaperAccount } from "@/lib/paper.functions";
import { toast } from "sonner";

import { runBacktest } from "@/lib/backtest.functions";
import { generateStrategy } from "@/lib/strategy.functions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, X, Bot, Play, Pause, Square, AlertTriangle } from "lucide-react";
import { JournalPanel } from "@/components/JournalPanel";
import { ChatPanel } from "@/components/ChatPanel";
import { startAgent, pauseAgent, stopAgent, emergencyStop, getAgentStatus, runAgentNow, updateAgentSymbols } from "@/lib/ai-trade-agent.functions";
import { TickerSearch } from "@/components/TickerSearch";

const MAX_AGENT_SYMBOLS = 5;

export const Route = createFileRoute("/_authenticated/lab")({
  head: () => ({ meta: [{ title: "Simulation Lab — Quanta Terminal" }] }),
  component: Lab,
});

function Lab() {
  const acct = useQuery({ queryKey: ["paper"], queryFn: () => getPaperAccount(), refetchInterval: 8000 });
  const positions = (acct.data?.positions ?? []) as any[];
  const orders = acct.data?.orders ?? [];
  const pending = acct.data?.pending ?? [];
  const pnl = acct.data?.pnl ?? { unrealized: 0, realized: 0, total: 0, positionsValue: 0 };
  const cash = Number(acct.data?.account?.cash ?? 0);
  const equity = Number(acct.data?.account?.equity ?? cash);
  const currency: "IDR" | "USD" = (acct.data?.account?.currency ?? "IDR") as "IDR" | "USD";
  const fmtMoney = (n: number) => currency === "IDR"
    ? formatIDRCompact(n)
    : (n >= 0 ? "$" : "-$") + Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 });

  const cancel = useMutation({
    mutationFn: (id: string) => cancelOrder({ data: { id } }),
    onSuccess: () => { toast.success("Order cancelled"); acct.refetch(); },
    onError: (e: any) => toast.error(e?.message ?? "Cancel failed"),
  });
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Simulation Lab</h1>
          <p className="text-sm text-muted-foreground">Paper trading {currency} · live P/L · advanced orders · journal · backtest · AI coach</p>
        </div>
        <ResetAccountControl onDone={() => acct.refetch()} currentCash={cash || (currency === "IDR" ? 100_000_000 : 100_000)} currency={currency} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="panel p-4"><div className="text-xs text-muted-foreground">Saldo Tersedia</div><div className="font-mono text-xl md:text-2xl">{fmtMoney(cash)}</div></div>
        <div className="panel p-4"><div className="text-xs text-muted-foreground">Equity Total</div><div className="font-mono text-xl md:text-2xl">{fmtMoney(equity)}</div></div>
        <div className="panel p-4"><div className="text-xs text-muted-foreground">Unrealized P/L</div><div className={`font-mono text-xl md:text-2xl ${colorForChange(pnl.unrealized)}`}>{fmtMoney(pnl.unrealized)}</div></div>
        <div className="panel p-4"><div className="text-xs text-muted-foreground">Positions</div><div className="font-mono text-xl md:text-2xl">{positions.length}</div></div>
        <div className="panel p-4"><div className="text-xs text-muted-foreground">Filled orders</div><div className="font-mono text-xl md:text-2xl">{orders.length}</div></div>
        <div className="panel p-4"><div className="text-xs text-muted-foreground">Pending</div><div className="font-mono text-xl md:text-2xl">{pending.length}</div></div>
      </div>

      <Tabs defaultValue="positions">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="positions">Positions</TabsTrigger>
          <TabsTrigger value="pending">Pending Orders</TabsTrigger>
          <TabsTrigger value="orders">Order History</TabsTrigger>
          <TabsTrigger value="journal">Trading Journal</TabsTrigger>
          <TabsTrigger value="backtest">Backtest</TabsTrigger>
          <TabsTrigger value="coach">AI Coach</TabsTrigger>
          <TabsTrigger value="agent"><Bot className="size-3 mr-1" />AI Trade Agent</TabsTrigger>
        </TabsList>
        <TabsContent value="positions">
          <div className="panel p-2 overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="text-left p-2">Symbol</th>
                  <th className="text-right p-2">Qty</th>
                  <th className="text-right p-2">Avg Price</th>
                  <th className="text-right p-2">Mark</th>
                  <th className="text-right p-2">P/L</th>
                  <th className="text-right p-2">%</th>
                  <th className="text-right p-2">Opened</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((p: any) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="p-2 font-medium">{p.symbol}</td>
                    <td className="p-2 text-right font-mono">{p.qty}</td>
                    <td className="p-2 text-right font-mono">{formatPrice(p.avg_price)}</td>
                    <td className="p-2 text-right font-mono">{p.mark != null ? formatPrice(p.mark) : "—"}</td>
                    <td className={`p-2 text-right font-mono ${colorForChange(p.pnl)}`}>{p.pnl != null ? fmtMoney(p.pnl) : "—"}</td>
                    <td className={`p-2 text-right font-mono ${colorForChange(p.pnlPct)}`}>{p.pnlPct != null ? formatPct(p.pnlPct) : "—"}</td>
                    <td className="p-2 text-right text-xs text-muted-foreground">{new Date(p.opened_at).toLocaleString("id-ID")}</td>
                  </tr>
                ))}
                {positions.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No open positions. Place a paper trade from any chart.</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>
        <TabsContent value="pending">
          <div className="panel p-2">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="text-left p-2">Symbol</th><th className="text-left p-2">Side</th><th className="text-left p-2">Type</th>
                  <th className="text-right p-2">Qty</th><th className="text-right p-2">Trigger</th><th className="text-right p-2">Created</th><th></th>
                </tr>
              </thead>
              <tbody>
                {pending.map((o: any) => (
                  <tr key={o.id} className="border-t border-border">
                    <td className="p-2 font-medium">{o.symbol}</td>
                    <td className={`p-2 uppercase text-xs ${o.side === "buy" ? "text-bull" : "text-bear"}`}>{o.side}</td>
                    <td className="p-2 text-xs uppercase">{o.type}</td>
                    <td className="p-2 text-right font-mono">{o.qty}</td>
                    <td className="p-2 text-right font-mono text-xs">
                      {o.type === "limit" && `≤ ${formatPrice(o.limit_price)}`}
                      {o.type === "stop" && `stop ${formatPrice(o.stop_price)}`}
                      {o.type === "stop_limit" && `stop ${formatPrice(o.stop_price)} / lim ${formatPrice(o.limit_price)}`}
                      {o.type === "trailing_stop" && `trail ${o.trailing_pct}% from ${formatPrice(o.trail_anchor)}`}
                    </td>
                    <td className="p-2 text-right text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString()}</td>
                    <td className="p-2 text-right">
                      <Button size="sm" variant="ghost" onClick={() => cancel.mutate(o.id)}><X className="size-3" /></Button>
                    </td>
                  </tr>
                ))}
                {pending.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No pending orders. Place a limit/stop order from any chart.</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>
        <TabsContent value="orders">
          <div className="panel p-2">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr><th className="text-left p-2">Time</th><th className="text-left p-2">Symbol</th><th className="text-left p-2">Side</th><th className="text-right p-2">Qty</th><th className="text-right p-2">Fill</th></tr>
              </thead>
              <tbody>
                {orders.map((o: any) => (
                  <tr key={o.id} className="border-t border-border">
                    <td className="p-2 text-xs text-muted-foreground">{new Date(o.filled_at ?? o.created_at).toLocaleString()}</td>
                    <td className="p-2 font-medium">{o.symbol}</td>
                    <td className={`p-2 uppercase text-xs ${o.side === "buy" ? "text-bull" : "text-bear"}`}>{o.side}</td>
                    <td className="p-2 text-right font-mono">{o.qty}</td>
                    <td className="p-2 text-right font-mono">{formatPrice(o.filled_price)}</td>
                  </tr>
                ))}
                {orders.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No orders yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </TabsContent>
        <TabsContent value="journal"><JournalPanel /></TabsContent>
        <TabsContent value="backtest"><Backtester /></TabsContent>
        <TabsContent value="coach"><AICoach /></TabsContent>
        <TabsContent value="agent"><AIAgentPanel /></TabsContent>
      </Tabs>
    </div>
  );
}

function AIAgentPanel() {
  const status = useQuery({ queryKey: ["ai-agent"], queryFn: () => getAgentStatus(), refetchInterval: 10000 });
  const agent = status.data?.agent as any;
  const session = status.data?.session as any;
  const decisions = (status.data?.decisions ?? []) as any[];
  const risks = (status.data?.risks ?? []) as any[];
  const performance = status.data?.performance as any;

  const [symbols, setSymbols] = useState<string[]>(["BBCA.JK", "BBRI.JK", "TLKM.JK", "ASII.JK", "BMRI.JK"]);
  const [alloc, setAlloc] = useState("1000000");
  const [risk, setRisk] = useState<"conservative" | "balanced" | "aggressive">("balanced");
  const [conf, setConf] = useState("0.70");

  // Sync local symbols from active agent on load
  useEffect(() => {
    const agentSyms = (agent?.selected_symbols ?? []) as string[];
    if (agentSyms.length > 0) setSymbols(agentSyms.slice(0, MAX_AGENT_SYMBOLS));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent?.id]);

  const updateSyms = useMutation({
    mutationFn: (next: string[]) => updateAgentSymbols({ data: { id: agent.id, selectedSymbols: next } }),
    onSuccess: () => { toast.success("Daftar emiten diperbarui"); status.refetch(); },
    onError: (e: any) => toast.error(e?.message ?? "Update failed"),
  });

  function addSymbol(sym: string) {
    const s = sym.trim().toUpperCase();
    if (!s) return;
    if (symbols.includes(s)) { toast.info(`${s} sudah ada di daftar`); return; }
    if (symbols.length >= MAX_AGENT_SYMBOLS) { toast.error(`Maksimal ${MAX_AGENT_SYMBOLS} emiten`); return; }
    const next = [...symbols, s];
    setSymbols(next);
    if (agent?.id && agent.status !== "stopped") updateSyms.mutate(next);
  }
  function removeSymbol(sym: string) {
    const next = symbols.filter(s => s !== sym);
    setSymbols(next);
    if (agent?.id && agent.status !== "stopped" && next.length > 0) updateSyms.mutate(next);
  }

  const start = useMutation({
    mutationFn: () => startAgent({ data: {
      selectedSymbols: symbols.slice(0, MAX_AGENT_SYMBOLS),
      allocationAmount: Number(alloc) || 1_000_000,
      riskLevel: risk, minConfidenceToTrade: Number(conf) || 0.7,
      strategyMode: "hybrid", maxPositionPerSymbol: 0.25, maxDailyTrades: 5,
      maxDailyLoss: 0.02, maxDrawdown: 0.05, autoStopLoss: true, autoTakeProfit: true,
      trailingStop: false, tradingHoursOnly: true, requireFreshData: true,
      allowBuy: true, allowSell: true,
    } }),
    onSuccess: () => { toast.success("Agent started"); status.refetch(); },
    onError: (e: any) => toast.error(e?.message ?? "Start failed"),
  });
  const pause = useMutation({
    mutationFn: () => pauseAgent({ data: { id: agent.id } }),
    onSuccess: () => { toast.success("Agent paused"); status.refetch(); },
  });
  const stop = useMutation({
    mutationFn: () => stopAgent({ data: { id: agent.id } }),
    onSuccess: () => { toast.success("Agent stopped"); status.refetch(); },
  });
  const estop = useMutation({
    mutationFn: () => emergencyStop({ data: { id: agent.id } }),
    onSuccess: () => { toast.success("Emergency stop"); status.refetch(); },
  });
  const tick = useMutation({
    mutationFn: () => runAgentNow({ data: { id: agent.id } }),
    onSuccess: (r: any) => { toast.success(`Tick: ${r.count} decisions, ${r.executed} executed`); status.refetch(); },
    onError: (e: any) => toast.error(e?.message ?? "Tick failed"),
  });

  const isActive = agent && agent.status !== "stopped" && agent.status !== "error";

  return (
    <div className="space-y-3">
      <div className="panel p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Bot className="size-5 text-primary" />
            <div>
              <div className="font-semibold flex items-center gap-2 flex-wrap">
                AI Trade Agent
                <span className="text-[10px] uppercase font-semibold bg-primary/15 text-primary px-1.5 py-0.5 rounded">Real Market Data</span>
                <span className="text-[10px] uppercase font-semibold bg-bull/15 text-bull px-1.5 py-0.5 rounded">Paper Trading Execution</span>
                <span className="text-[10px] uppercase font-semibold bg-muted text-muted-foreground px-1.5 py-0.5 rounded">Simulated Fill</span>
                <span className="text-[10px] uppercase font-semibold bg-muted text-muted-foreground px-1.5 py-0.5 rounded">Training Data Saved</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Status: <span className="font-mono">{agent?.status ?? "stopped"}</span> · IDX session: <span className="font-mono">{session?.label ?? "—"}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {!isActive && <Button size="sm" onClick={() => start.mutate()} disabled={start.isPending}><Play className="size-3 mr-1" />Start</Button>}
            {isActive && agent.status !== "paused" && <Button size="sm" variant="outline" onClick={() => pause.mutate()}><Pause className="size-3 mr-1" />Pause</Button>}
            {isActive && <Button size="sm" variant="outline" onClick={() => tick.mutate()} disabled={tick.isPending}>Run now</Button>}
            {isActive && <Button size="sm" variant="outline" onClick={() => stop.mutate()}><Square className="size-3 mr-1" />Stop</Button>}
            {isActive && <Button size="sm" variant="destructive" onClick={() => estop.mutate()}><AlertTriangle className="size-3 mr-1" />Emergency</Button>}
          </div>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          AI Agent menggunakan data pasar, berita, sentimen, dan harga aktual sebagai bahan analisis.
          Namun seluruh transaksi dilakukan hanya di Paper Trading menggunakan saldo virtual — tidak ada eksekusi real-money,
          tidak terhubung ke broker, dan tidak ada order ke sekuritas.
        </p>

        {!isActive && (
          <div className="grid md:grid-cols-4 gap-2">
            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground">Emiten (maks {MAX_AGENT_SYMBOLS})</label>
              <TickerSearch
                placeholder="Cari emiten (BBCA.JK, AAPL, …)"
                onPick={(sym) => addSymbol(sym)}
              />
              <div className="flex flex-wrap gap-1 mt-2 min-h-6">
                {symbols.length === 0 && <span className="text-xs text-muted-foreground">Belum ada emiten dipilih.</span>}
                {symbols.map(s => (
                  <span key={s} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-accent text-xs font-mono">
                    {s}
                    <button type="button" onClick={() => removeSymbol(s)} className="hover:text-destructive" aria-label={`Hapus ${s}`}>
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">{symbols.length}/{MAX_AGENT_SYMBOLS} dipilih</div>
            </div>
            <div><label className="text-xs text-muted-foreground">Allocation / trade (IDR)</label><Input type="number" value={alloc} onChange={e => setAlloc(e.target.value)} /></div>
            <div>
              <label className="text-xs text-muted-foreground">Risk level</label>
              <Select value={risk} onValueChange={(v) => setRisk(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="conservative">Conservative (SL 1.5% / TP 3.5%)</SelectItem>
                  <SelectItem value="balanced">Balanced (SL 2.5% / TP 5%)</SelectItem>
                  <SelectItem value="aggressive">Aggressive (SL 4% / TP 8%)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><label className="text-xs text-muted-foreground">Min confidence (0–1)</label><Input value={conf} onChange={e => setConf(e.target.value)} /></div>
          </div>
        )}
      </div>

      {performance && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <Stat label="Total trades" value={String(performance.total_trades ?? 0)} />
          <Stat label="Win rate" value={Number(performance.win_rate ?? 0).toFixed(1) + "%"} tone={Number(performance.win_rate) >= 50 ? "bull" : "bear"} />
          <Stat label="Profit factor" value={Number(performance.profit_factor ?? 0).toFixed(2)} />
          <Stat label="Total return" value={formatIDRCompact(Number(performance.total_return ?? 0))} tone={Number(performance.total_return) >= 0 ? "bull" : "bear"} />
          <Stat label="Best / Worst" value={`${formatIDRCompact(Number(performance.best_trade ?? 0))} / ${formatIDRCompact(Number(performance.worst_trade ?? 0))}`} />
        </div>
      )}

      <div className="panel p-2 overflow-x-auto">
        <div className="px-2 py-1 text-xs text-muted-foreground">Decision feed</div>
        <table className="w-full text-sm min-w-[720px]">
          <thead className="text-xs text-muted-foreground">
            <tr><th className="text-left p-2">Time</th><th className="text-left p-2">Symbol</th><th className="text-left p-2">Action</th>
              <th className="text-right p-2">Conf (raw→cal)</th><th className="text-right p-2">Lot</th>
              <th className="text-right p-2">Entry</th><th className="text-right p-2">SL</th><th className="text-right p-2">TP</th>
              <th className="text-left p-2">Source · Fresh</th>
              <th className="text-left p-2">Status</th><th className="text-left p-2">Reasoning</th></tr>
          </thead>
          <tbody>
            {decisions.map((d: any) => {
              const raw = Number(d.raw_confidence ?? d.confidence ?? 0);
              const cal = Number(d.calibrated_confidence ?? d.confidence ?? 0);
              const fresh = d.data_freshness_seconds;
              return (
                <tr key={d.id} className="border-t border-border align-top">
                  <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">{new Date(d.created_at).toLocaleTimeString("id-ID")}</td>
                  <td className="p-2 font-medium">{d.symbol}</td>
                  <td className={`p-2 text-xs font-semibold ${d.action === "BUY" ? "text-bull" : d.action === "EXIT" || d.action === "SELL" ? "text-bear" : ""}`}>{d.action}</td>
                  <td className="p-2 text-right font-mono text-xs">{(raw * 100).toFixed(0)}% → <span className="font-semibold">{(cal * 100).toFixed(0)}%</span></td>
                  <td className="p-2 text-right font-mono">{d.suggested_lot ?? "—"}</td>
                  <td className="p-2 text-right font-mono">{d.entry_price ? formatPrice(d.entry_price) : "—"}</td>
                  <td className="p-2 text-right font-mono">{d.stop_loss ? formatPrice(d.stop_loss) : "—"}</td>
                  <td className="p-2 text-right font-mono">{d.take_profit ? formatPrice(d.take_profit) : "—"}</td>
                  <td className="p-2 text-[11px] text-muted-foreground max-w-[180px] truncate" title={d.data_source ?? ""}>
                    {d.data_source ?? "—"}{fresh != null ? ` · ${fresh}s` : ""}
                  </td>
                  <td className="p-2 text-xs">{d.decision_status ?? "—"}</td>
                  <td className="p-2 text-xs text-muted-foreground max-w-md">
                    {d.reasoning}
                    {d.calibration_reason ? <div className="mt-1 text-[10px] italic opacity-80">↳ {d.calibration_reason}</div> : null}
                  </td>
                </tr>
              );
            })}
            {decisions.length === 0 && <tr><td colSpan={11} className="p-6 text-center text-muted-foreground">No decisions yet. Start the agent or click "Run now".</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="panel p-2">
        <div className="px-2 py-1 text-xs text-muted-foreground">Risk guard log</div>
        <ul className="text-xs divide-y divide-border">
          {risks.map((r: any) => (
            <li key={r.id} className="p-2 flex justify-between gap-2">
              <span><span className="font-semibold uppercase">{r.risk_type}</span> · {r.symbol ?? ""} — {r.message}</span>
              <span className="text-muted-foreground">{new Date(r.created_at).toLocaleString("id-ID")}</span>
            </li>
          ))}
          {risks.length === 0 && <li className="p-3 text-center text-muted-foreground">No risk events.</li>}
        </ul>
      </div>
    </div>
  );
}

function AICoach() {
  return (
    <div className="panel p-4">
      <p className="text-sm text-muted-foreground mb-3">Ask the AI to review your trades, suggest improvements, or generate a strategy idea.</p>
      <ChatPanel system="You are an institutional trading coach. Review the user's described trades, point out mistakes (sizing, timing, risk), and suggest concrete improvements. Use markdown bullets." />
    </div>
  );
}

function Backtester() {
  const [symbol, setSymbol] = useState("AAPL");
  const [tf, setTf] = useState("1d");
  const [rule, setRule] = useState<"ema_cross" | "rsi_reversal" | "macd_cross">("ema_cross");
  const run = useMutation({
    mutationFn: () => runBacktest({ data: { symbol: symbol.toUpperCase(), timeframe: tf, rule, persist: true } }),
    onError: (e: any) => toast.error(e?.message ?? "Backtest failed"),
  });
  const m = (run.data as any)?.metrics;
  const [aiPrompt, setAiPrompt] = useState("");
  const gen = useMutation({
    mutationFn: () => generateStrategy({ data: { prompt: aiPrompt, symbol: symbol.toUpperCase() } }),
    onSuccess: (r: any) => { setRule(r.rule); toast.success(`AI picked: ${r.name}`); },
    onError: (e: any) => toast.error(e?.message ?? "AI failed"),
  });
  return (
    <div className="space-y-3">
      <div className="panel p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="size-4 text-primary" /> AI Strategy Generator</div>
        <div className="flex gap-2">
          <Input value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} placeholder='e.g., "buy oversold tech stocks on RSI bounce"' />
          <Button onClick={() => gen.mutate()} disabled={gen.isPending || !aiPrompt.trim()}>{gen.isPending ? "Designing…" : "Generate"}</Button>
        </div>
        {gen.data && <div className="text-xs text-muted-foreground"><span className="text-foreground font-semibold">{gen.data.name}</span> · {gen.data.description}</div>}
      </div>

      <div className="panel p-4 grid md:grid-cols-5 gap-2 items-end">
        <div><label className="text-xs text-muted-foreground">Symbol</label><Input value={symbol} onChange={e => setSymbol(e.target.value)} /></div>
        <div>
          <label className="text-xs text-muted-foreground">Timeframe</label>
          <Select value={tf} onValueChange={setTf}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {["15m","1h","1d","1wk"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <label className="text-xs text-muted-foreground">Strategy</label>
          <Select value={rule} onValueChange={(v) => setRule(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ema_cross">EMA(12) × EMA(26) cross</SelectItem>
              <SelectItem value="rsi_reversal">RSI(14) reversal (30/70)</SelectItem>
              <SelectItem value="macd_cross">MACD histogram zero-cross</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => run.mutate()} disabled={run.isPending}>{run.isPending ? "Running…" : "Run backtest"}</Button>
      </div>

      {m && (
        <div className="grid md:grid-cols-6 gap-2">
          <Stat label="Trades" value={m.trades.toString()} />
          <Stat label="Win rate" value={m.winRate.toFixed(1) + "%"} tone={m.winRate >= 50 ? "bull" : "bear"} />
          <Stat label="Total return" value={m.totalReturnPct.toFixed(2) + "%"} tone={m.totalReturnPct >= 0 ? "bull" : "bear"} />
          <Stat label="Max DD" value={"-" + m.maxDrawdownPct.toFixed(2) + "%"} tone="bear" />
          <Stat label="Sharpe" value={m.sharpe.toFixed(2)} />
          <Stat label="Profit factor" value={isFinite(m.profitFactor) ? m.profitFactor.toFixed(2) : "∞"} />
        </div>
      )}

      {run.data && (
        <div className="panel p-2 max-h-80 overflow-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground"><tr><th className="text-left p-2">Entry</th><th className="text-left p-2">Exit</th><th className="text-right p-2">Entry $</th><th className="text-right p-2">Exit $</th><th className="text-right p-2">PnL %</th></tr></thead>
            <tbody>
              {(run.data as any).trades.map((t: any, i: number) => (
                <tr key={i} className="border-t border-border">
                  <td className="p-2">{t.entryTime ? new Date(t.entryTime * 1000).toLocaleDateString() : "—"}</td>
                  <td className="p-2">{t.exitTime ? new Date(t.exitTime * 1000).toLocaleDateString() : "—"}</td>
                  <td className="p-2 text-right font-mono">{Number(t.entry ?? 0).toFixed(2)}</td>
                  <td className="p-2 text-right font-mono">{Number(t.exit ?? 0).toFixed(2)}</td>
                  <td className={`p-2 text-right font-mono ${Number(t.pnlPct ?? 0) >= 0 ? "text-bull" : "text-bear"}`}>{Number(t.pnlPct ?? 0).toFixed(2)}%</td>
                </tr>
              ))}
              {!(run.data as any).trades.length && <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No trades produced.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "bull" | "bear" }) {
  return (
    <div className="panel p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-mono text-lg ${tone === "bull" ? "text-bull" : tone === "bear" ? "text-bear" : ""}`}>{value}</div>
    </div>
  );
}

function ResetAccountControl({ onDone, currentCash, currency }: { onDone: () => void; currentCash: number; currency: "IDR" | "USD" }) {
  const [open, setOpen] = useState(false);
  const defaultAmt = currency === "IDR" ? 100_000_000 : 100_000;
  const [amount, setAmount] = useState(String(currentCash || defaultAmt));
  useEffect(() => { setAmount(String(currentCash || defaultAmt)); }, [currentCash, defaultAmt]);
  const sym = currency === "IDR" ? "Rp" : "$";
  const fmtBtn = (v: number) => currency === "IDR" ? formatIDRCompact(v) : `$${v / 1000}k`;
  const reset = useMutation({
    mutationFn: (cash: number) => resetPaperAccount({ data: { cash, currency } }),
    onSuccess: (_r, cash) => { toast.success(`Account reset to ${fmtBtn(cash)}`); setOpen(false); onDone(); },
    onError: (e: any) => toast.error(e?.message ?? "Reset failed"),
  });
  if (!open) return <Button variant="outline" onClick={() => setOpen(true)}>Reset / Set Saldo ({currency})</Button>;
  const presets = currency === "IDR"
    ? [10_000_000, 50_000_000, 100_000_000, 500_000_000, 1_000_000_000]
    : [10_000, 50_000, 100_000, 500_000, 1_000_000];
  return (
    <div className="panel p-3 flex flex-wrap items-end gap-2">
      <div>
        <label className="text-[11px] text-muted-foreground block">Saldo awal ({sym})</label>
        <Input type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)} className="w-44" />
      </div>
      <div className="flex flex-wrap gap-1">
        {presets.map(v => (
          <Button key={v} size="sm" variant="ghost" onClick={() => setAmount(String(v))}>{fmtBtn(v)}</Button>
        ))}
      </div>
      <Button onClick={() => reset.mutate(Math.max(0, Number(amount) || 0))} disabled={reset.isPending}>
        {reset.isPending ? "…" : "Apply"}
      </Button>
      <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
    </div>
  );
}

export { ChatPanel } from "@/components/ChatPanel";

