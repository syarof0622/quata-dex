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
import { listStrategyPerformance, type StrategyName } from "@/lib/strategy-intelligence.functions";
import { generateStrategy } from "@/lib/strategy.functions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sparkles, X, Bot, Play, Pause, Square, AlertTriangle } from "lucide-react";
import { JournalPanel } from "@/components/JournalPanel";
import { ChatPanel } from "@/components/ChatPanel";
import { startAgent, pauseAgent, stopAgent, emergencyStop, getAgentStatus, runAgentNow, updateAgentSymbols, listTradeMemory, setSelectionMode, runAutonomousScanNow, getLatestScan, setAutonomousRiskMode, backfillScanCandidateOutcomes, repairAITrainingEventLabels } from "@/lib/ai-trade-agent.functions";
import { testAIAgentCronServer } from "@/lib/cron-test.functions";
import { TickerSearch } from "@/components/TickerSearch";
import { AiInsightsPanel } from "@/components/AiInsightsPanel";

const MAX_AGENT_SYMBOLS = 5;

// IDX (saham Indonesia) selalu ditampilkan dalam WIB (Asia/Jakarta).
const WIB_TZ = "Asia/Jakarta";
const _toValidDate = (d: string | number | Date): Date | null => {
  if (d == null || d === "") return null;
  const dt = d instanceof Date ? d : new Date(d);
  return isNaN(dt.getTime()) ? null : dt;
};
const fmtWIBDateTime = (d: string | number | Date) => {
  const dt = _toValidDate(d); return dt ? dt.toLocaleString("id-ID", { timeZone: WIB_TZ, hour12: false }) + " WIB" : "—";
};
const fmtWIBTime = (d: string | number | Date) => {
  const dt = _toValidDate(d); return dt ? dt.toLocaleTimeString("id-ID", { timeZone: WIB_TZ, hour12: false }) + " WIB" : "—";
};
const fmtWIBDate = (d: string | number | Date) => {
  const dt = _toValidDate(d); return dt ? dt.toLocaleDateString("id-ID", { timeZone: WIB_TZ }) : "—";
};


type LabSearch = { tab?: string };
export const Route = createFileRoute("/_authenticated/lab")({
  head: () => ({ meta: [{ title: "Simulation Lab — Quanta Terminal" }] }),
  validateSearch: (s: Record<string, unknown>): LabSearch => ({
    tab: typeof s.tab === "string" ? s.tab : undefined,
  }),
  component: Lab,
});

function Lab() {
  const search = Route.useSearch();
  const initialTab = (search as LabSearch)?.tab ?? "positions";
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

      <Tabs defaultValue={initialTab}>
        <TabsList className="flex-wrap h-auto no-scrollbar overflow-x-auto max-w-full">

          <TabsTrigger value="positions">Positions</TabsTrigger>
          <TabsTrigger value="pending">Pending Orders</TabsTrigger>
          <TabsTrigger value="orders">Order History</TabsTrigger>
          <TabsTrigger value="journal">Trading Journal</TabsTrigger>
          <TabsTrigger value="backtest">Backtest</TabsTrigger>
          <TabsTrigger value="coach">AI Coach</TabsTrigger>
          <TabsTrigger value="agent"><Bot className="size-3 mr-1" />AI Trade Agent</TabsTrigger>
          <TabsTrigger value="insights"><Sparkles className="size-3 mr-1" />AI Insights</TabsTrigger>
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
                    <td className="p-2 text-right text-xs text-muted-foreground">{fmtWIBDateTime(p.opened_at)}</td>
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
                    <td className="p-2 text-right text-xs text-muted-foreground">{fmtWIBDateTime(o.created_at)}</td>
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
                    <td className="p-2 text-xs text-muted-foreground">{fmtWIBDateTime(o.filled_at ?? o.created_at)}</td>
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
        <TabsContent value="insights"><AiInsightsPanel /></TabsContent>
      </Tabs>
    </div>
  );
}

// ---- Helpers for AI Trade Agent UI presentation ----

type ExecStatus =
  | "executed_buy"
  | "executed_sell"
  | "executed_exit"
  | "executed_stop_loss"
  | "executed_take_profit"
  | "watch_snapshot"
  | "research_snapshot"
  | "premarket_snapshot"
  | "allowed"
  | "blocked_emergency"
  | "blocked_paused"
  | "blocked_stopped"
  | "blocked_market_closed"
  | "blocked_market_break"
  | "blocked_data_stale"
  | "blocked_data_unavailable"
  | "blocked_insufficient_balance"
  | "blocked_risk_limit"
  | "blocked_low_confidence"
  | "blocked_duplicate_order"
  | "blocked_rr_invalid"
  | "blocked_max_daily_trades"
  | "blocked_max_active_positions"
  | "blocked_max_new_entries"
  | "blocked_cooldown"
  | "hold_position";

const EXEC_LABEL: Record<ExecStatus, string> = {
  executed_buy: "Executed — Paper BUY",
  executed_sell: "Executed — Paper SELL",
  executed_exit: "Executed — Paper EXIT",
  executed_stop_loss: "Executed — Stop Loss",
  executed_take_profit: "Executed — Take Profit",
  watch_snapshot: "Watch snapshot",
  research_snapshot: "Research snapshot",
  premarket_snapshot: "Pre-market plan",
  allowed: "Allowed",
  blocked_emergency: "Blocked — Emergency stop",
  blocked_paused: "Blocked — Agent paused",
  blocked_stopped: "Blocked — Agent stopped",
  blocked_market_closed: "Blocked — Market closed",
  blocked_market_break: "Blocked — Market break",
  blocked_data_stale: "Blocked — Data stale",
  blocked_data_unavailable: "Blocked — Price unavailable",
  blocked_insufficient_balance: "Blocked — Insufficient paper balance",
  blocked_risk_limit: "Blocked — Risk limit reached",
  blocked_low_confidence: "Blocked — Confidence below threshold",
  blocked_duplicate_order: "Blocked — Duplicate order guard",
  blocked_rr_invalid: "Blocked — Risk/reward invalid",
  blocked_max_daily_trades: "Blocked — Max daily AI trades reached",
  blocked_max_active_positions: "Blocked — Max active positions reached",
  blocked_max_new_entries: "Blocked — Max new entries today reached",
  blocked_cooldown: "Blocked — Cooldown active",
  hold_position: "Holding position",
};

// True only when AI actually placed a simulated paper order for this decision.
function isExecutedDecision(d: any): boolean {
  if (!d) return false;
  if (d.action === "HOLD") return false;
  if (d.decision_status !== "executed") return false;
  if (!(Number(d.suggested_lot) > 0)) return false;
  return d.entry_price != null;
}

// Reference / scan price (NOT entry). Pulled from data_snapshot saved by the
// autonomous scanner, falling back to entry_price for legacy rows.
function referencePriceFor(d: any): number | null {
  const snap: any = d?.data_snapshot ?? {};
  const ref = snap.scanPrice ?? snap.referencePrice ?? snap.price;
  if (ref != null && !Number.isNaN(Number(ref))) return Number(ref);
  if (d?.action === "HOLD" && d?.entry_price != null) return Number(d.entry_price);
  return null;
}

function lotZeroExplanation(execStatus: ExecStatus): string {
  switch (execStatus) {
    case "blocked_insufficient_balance":
      return "Saldo paper trading tidak cukup untuk minimal 1 lot.";
    case "blocked_low_confidence":
      return "AI hanya menyimpan watch/research snapshot. Tidak ada paper order yang dieksekusi.";
    case "blocked_market_closed":
    case "blocked_market_break":
      return "Market sedang tutup. AI hanya menyimpan snapshot analisis tanpa paper order.";
    case "blocked_data_unavailable":
      return "Harga fresh tidak tersedia, sehingga AI tidak dapat menghitung lot dan tidak mengeksekusi order.";
    case "watch_snapshot":
    case "research_snapshot":
    case "premarket_snapshot":
      return "Lot 0 karena kandidat hanya disimpan untuk dipantau — tidak ada paper order yang dieksekusi.";
    default:
      return "Lot 0 karena tidak ada paper order yang dieksekusi pada decision ini.";
  }
}

// Signal intent (what the AI WANTED to do) — separate from displayed action
// (what actually happened). Persisted in data_snapshot.signalIntent by the
// worker; falls back to the raw action column for legacy rows.
function signalIntentFor(d: any): "BUY" | "SELL" | "EXIT" | "WATCH" | "NONE" {
  const snap: any = d?.data_snapshot ?? {};
  const raw = String(snap.signalIntent ?? d?.action ?? "").toUpperCase();
  if (raw === "BUY" || raw === "SELL" || raw === "EXIT" || raw === "WATCH") return raw as any;
  return "NONE";
}

// Derived "display action" so the Action column does not show "BUY" when no
// paper order was actually executed. HOLD is reserved for live open positions —
// we cross-check `openSymbols` (from paper_positions) to demote stale HOLD rows.
function displayActionFor(d: any, execStatus: ExecStatus, openSymbols?: Set<string>): {
  label: string;
  intent: string | null;
  tone: "bull" | "bear" | "muted" | "warn";
} {
  const action = String(d?.action ?? "").toUpperCase();
  const executed = isExecutedDecision(d);
  if (executed) {
    if (action === "BUY")  return { label: "BUY",  intent: null, tone: "bull" };
    if (action === "SELL") return { label: "SELL", intent: null, tone: "bear" };
    if (action === "EXIT") return { label: "EXIT", intent: null, tone: "bear" };
  }
  // HOLD requires a real open position. If paper_positions doesn't contain the
  // symbol, downgrade so the UI never lies about "holding".
  const hasOpen = openSymbols ? openSymbols.has(String(d?.symbol ?? "")) : true;
  if (execStatus === "hold_position" && hasOpen) {
    return { label: "HOLD", intent: null, tone: "muted" };
  }
  if (action === "HOLD" && !hasOpen) {
    return { label: "WATCH", intent: "WATCH", tone: "warn" };
  }
  if (execStatus === "watch_snapshot")     return { label: "WATCH",    intent: action || null, tone: "warn" };
  if (execStatus === "research_snapshot")  return { label: "RESEARCH", intent: action || null, tone: "warn" };
  if (execStatus === "premarket_snapshot") return { label: "PRE-MKT",  intent: action || null, tone: "warn" };
  if (execStatus.startsWith("blocked_")) {
    return { label: "BLOCKED", intent: action || null, tone: "bear" };
  }
  if (execStatus === "allowed" && action) {
    return { label: action, intent: null, tone: action === "BUY" ? "bull" : action === "SELL" || action === "EXIT" ? "bear" : "muted" };
  }
  return { label: action || "—", intent: null, tone: "muted" };
}

// Decision Feed filter taxonomy (per spec): keep previous-session events out of
// the default Active view, and let the user drill into Executed / Blocked / Watch.
type FeedFilter = "active" | "executed" | "open_position" | "blocked" | "watch_research" | "previous" | "all";
const FEED_FILTER_OPTIONS: { value: FeedFilter; label: string }[] = [
  { value: "active",         label: "Active Session" },
  { value: "executed",       label: "Executed Only" },
  { value: "open_position",  label: "Open Position Events" },
  { value: "blocked",        label: "Blocked" },
  { value: "watch_research", label: "Watch / Research" },
  { value: "previous",       label: "Previous Session" },
  { value: "all",            label: "All" },
];

const TONE_TEXT: Record<"bull"|"bear"|"muted"|"warn", string> = {
  bull: "text-bull",
  bear: "text-bear",
  muted: "text-muted-foreground",
  warn: "text-amber-600 dark:text-amber-400",
};
const TONE_BADGE: Record<"bull"|"bear"|"muted"|"warn", string> = {
  bull: "bg-bull/15 text-bull",
  bear: "bg-bear/15 text-bear",
  muted: "bg-muted text-muted-foreground",
  warn: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
};

function deriveExecutionStatusForCard(
  agent: any,
  session: any,
  d: any,
): { status: ExecStatus; primary: string; detail: string; secondary?: string } {
  const agentStatus = agent?.status ?? "stopped";
  const reasoning = String(d?.reasoning ?? "").toLowerCase();
  const dStatus = d?.decision_status as string | undefined;
  const action = d?.action as string | undefined;
  const blockReason = (d?.data_snapshot as any)?.blockReason as string | undefined;

  // 0. Executed paper orders — show success states.
  if (isExecutedDecision(d)) {
    if (action === "BUY")  return { status: "executed_buy",  primary: "Paper BUY executed",  detail: "Paper order BUY berhasil dieksekusi." };
    if (action === "SELL") return { status: "executed_sell", primary: "Paper SELL executed", detail: "Paper order SELL berhasil dieksekusi." };
    if (action === "EXIT") {
      const cr = String(d?.close_reason ?? d?.risk_snapshot?.closeReason ?? "");
      if (cr === "stop_loss_triggered")   return { status: "executed_stop_loss",   primary: "Stop loss triggered",   detail: "Posisi ditutup karena stop loss." };
      if (cr === "take_profit_triggered") return { status: "executed_take_profit", primary: "Take profit triggered", detail: "Posisi ditutup karena take profit." };
      return { status: "executed_exit", primary: "Paper EXIT executed", detail: "Posisi paper ditutup oleh agent." };
    }
  }

  // 0b. Watch / research / pre-market snapshots — explicit no-trade states.
  if (dStatus === "watch_only") {
    return { status: "watch_snapshot", primary: "Watch snapshot",
      detail: "Kandidat disimpan untuk dipantau. Tidak ada paper order yang dieksekusi." };
  }
  if (dStatus === "research_only") {
    return { status: "research_snapshot", primary: "Research snapshot",
      detail: "Kandidat disimpan untuk training/outcome tracking. Tidak ada paper order yang dieksekusi." };
  }
  if (dStatus === "premarket_plan") {
    return { status: "premarket_snapshot", primary: "Pre-market plan",
      detail: "Pre-market watchlist. Monitor saat market open — belum ada paper order." };
  }

  // 0c. Specific limit_reached / cooldown reasons (from persisted blockReason).
  if (dStatus === "limit_reached" || dStatus === "cooldown") {
    if (blockReason === "max_daily_ai_trades_reached") {
      return { status: "blocked_max_daily_trades", primary: "Max daily AI trades reached",
        detail: "Batas max daily AI trades sudah tercapai untuk hari ini. AI tidak membuka entry baru sampai window berikutnya." };
    }
    if (blockReason === "max_active_positions_reached") {
      return { status: "blocked_max_active_positions", primary: "Max active positions reached",
        detail: `AI ingin BUY ${d.symbol}, tetapi slot max active positions sudah penuh.` };
    }
    if (blockReason === "max_new_entries_per_day_reached") {
      return { status: "blocked_max_new_entries", primary: "Max new entries today reached",
        detail: "Jumlah entry baru hari ini sudah mencapai batas. Posisi existing tetap dimonitor." };
    }
    if (blockReason === "cooldown_active" || blockReason === "duplicate_order_guard") {
      return { status: "blocked_cooldown", primary: "Cooldown / duplicate guard aktif",
        detail: "Menunggu jeda antar aksi pada simbol ini untuk mencegah duplikat order." };
    }
    if (dStatus === "limit_reached") {
      return { status: "blocked_risk_limit", primary: "Risk limit reached",
        detail: "AI ingin trade, tetapi salah satu risk limit harian sudah tercapai." };
    }
    return { status: "blocked_cooldown", primary: "Cooldown aktif",
      detail: "Menunggu jeda antar aksi pada simbol ini untuk mencegah duplikat order." };
  }

  // 0d. Decision-engine block reasons.
  if (blockReason === "insufficient_balance") {
    return { status: "blocked_insufficient_balance", primary: "Saldo paper tidak cukup",
      detail: "Saldo paper trading tidak cukup untuk minimal 1 lot." };
  }
  if (blockReason === "risk_reward_invalid") {
    return { status: "blocked_rr_invalid", primary: "Risk/reward invalid",
      detail: "Risk/reward setup tidak memenuhi minimum untuk mode risiko ini." };
  }
  if (blockReason === "confidence_below_threshold") {
    return { status: "blocked_low_confidence", primary: "Confidence di bawah threshold",
      detail: "AI belum mengeksekusi order karena confidence masih di bawah threshold." };
  }
  if (blockReason === "exposure_cap_reached") {
    return { status: "blocked_max_active_positions", primary: "Exposure cap reached",
      detail: "Eksposur portfolio sudah mencapai batas untuk mode risiko ini." };
  }
  if (blockReason === "lot_below_minimum") {
    return { status: "blocked_insufficient_balance", primary: "Lot di bawah minimum",
      detail: "Alokasi tidak cukup untuk minimal 1 lot pada harga saat ini." };
  }
  if (blockReason === "market_closed") {
    return { status: "blocked_market_closed", primary: "Market closed",
      detail: "Market sedang tutup. AI hanya menyimpan snapshot analisis tanpa paper order." };
  }

  if (agentStatus === "error") {
    return { status: "blocked_emergency", primary: "Emergency stop",
      detail: "Agent dihentikan paksa. Tidak ada order baru sampai agent di-start ulang." };
  }
  if (agentStatus === "paused") {
    return { status: "blocked_paused", primary: "Agent paused",
      detail: "Agent sedang dijeda. Eksekusi paper order sementara diblokir." };
  }
  if (agentStatus === "stopped") {
    return { status: "blocked_stopped", primary: "Agent stopped",
      detail: "Agent tidak aktif. Klik Start untuk mulai cycle." };
  }
  if (session && !session.isOpen) {
    if (session.isBreak) {
      return { status: "blocked_market_break", primary: "Market break",
        detail: "Market sedang tutup. AI hanya menyimpan snapshot analisis tanpa paper order.",
        secondary: "Signal & confidence tidak dievaluasi karena eksekusi diblokir oleh market session." };
    }
    return { status: "blocked_market_closed", primary: "Market closed",
      detail: "Market sedang tutup. AI hanya menyimpan snapshot analisis tanpa paper order.",
      secondary: "Confidence tidak dievaluasi karena eksekusi diblokir." };
  }
  if (/tidak fresh|stale/.test(reasoning)) {
    return { status: "blocked_data_stale", primary: "Data harga stale",
      detail: "Harga belum cukup fresh untuk keputusan eksekusi. AI menyimpan snapshot saja." };
  }
  if (/harga aktual tidak tersedia|quote unavailable|tidak tersedia/.test(reasoning)) {
    return { status: "blocked_data_unavailable", primary: "Price unavailable",
      detail: "Harga fresh tidak tersedia, sehingga AI tidak dapat menghitung lot dan tidak mengeksekusi order." };
  }
  if (/saldo .* tidak cukup|saldo paper|insufficient/.test(reasoning)) {
    return { status: "blocked_insufficient_balance", primary: "Saldo paper tidak cukup",
      detail: "Saldo paper trading tidak cukup untuk minimal 1 lot." };
  }
  if (/confidence .* < threshold|confidence sinyal/.test(reasoning)) {
    return { status: "blocked_low_confidence", primary: "Confidence di bawah threshold",
      detail: "AI belum mengeksekusi order karena confidence masih di bawah threshold. Kandidat hanya disimpan sebagai watch/research snapshot." };
  }
  if (action === "WATCH") {
    return { status: "watch_snapshot", primary: "Watch (autonomous)",
      detail: "AI memantau kandidat ini. Belum ada paper order — menunggu setup atau perbaikan signal." };
  }
  if (action === "NO_TRADE") {
    return { status: "blocked_low_confidence", primary: "No trade",
      detail: "Tidak ada setup valid pada simbol ini. AI menunggu sinyal berikutnya." };
  }
  if (action === "BLOCKED") {
    return { status: "blocked_low_confidence", primary: "Blocked",
      detail: d?.reasoning || "Decision diblokir oleh guard eksekusi. Lihat alasan untuk detail." };
  }
  if (action === "HOLD") {
    return { status: "hold_position", primary: "Holding position",
      detail: "AI menahan posisi existing. Tidak ada paper order baru pada tick ini." };
  }
  return { status: "allowed", primary: "Allowed", detail: "Setup valid untuk eksekusi paper order." };
}

type DataStatus = "fresh" | "stale" | "unavailable";
function classifyFreshness(seconds: number | null | undefined): DataStatus {
  if (seconds == null) return "unavailable";
  if (seconds <= 600) return "fresh";
  if (seconds <= 3600) return "stale";
  return "stale";
}
function statusBadgeClass(s: DataStatus | "allowed" | "blocked") {
  if (s === "fresh" || s === "allowed") return "bg-bull/15 text-bull";
  if (s === "stale") return "bg-amber-500/15 text-amber-600 dark:text-amber-400";
  if (s === "blocked") return "bg-bear/15 text-bear";
  return "bg-muted text-muted-foreground";
}

function confidenceCell(agent: any, session: any, d: any) {
  const agentStatus = agent?.status ?? "stopped";
  const raw = Number(d?.raw_confidence ?? d?.confidence ?? 0);
  const cal = Number(d?.calibrated_confidence ?? d?.confidence ?? 0);
  if (agentStatus === "paused") return { label: "Paused", tooltip: "Agent paused. Confidence tidak dievaluasi.", muted: true };
  if (session && !session.isOpen) {
    return { label: "Paused",
      tooltip: session.isBreak ? "Confidence tidak dievaluasi karena IDX sedang break." : "Confidence tidak dievaluasi karena market tutup.",
      muted: true };
  }
  if (raw === 0 && cal === 0) {
    return { label: "Not evaluated", tooltip: "Confidence belum dihitung karena price/technical data belum tersedia.", muted: true };
  }
  return { label: `${(raw * 100).toFixed(0)}% → ${(cal * 100).toFixed(0)}%`, tooltip: "Raw → calibrated confidence.", muted: false };
}

function runButtonCopy(agent: any, session: any) {
  const tip = "Manual trigger for debugging. AI automation runs automatically when the server worker is active — you do not need to click this for the agent to trade.";
  const s = agent?.status ?? "stopped";
  if (s === "paused") return { label: "Manual run (preview)", tip };
  if (session && !session.isOpen) return { label: "Manual run (analysis only)", tip };
  return { label: "Manual run now", tip };
}

function formatRelativeWIB(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const absSec = Math.abs(diffMs) / 1000;
  const future = diffMs < 0;
  let rel: string;
  if (absSec < 60) rel = `${Math.round(absSec)}s ${future ? "from now" : "ago"}`;
  else if (absSec < 3600) rel = `${Math.round(absSec / 60)}m ${future ? "from now" : "ago"}`;
  else if (absSec < 86400) rel = `${Math.round(absSec / 3600)}h ${future ? "from now" : "ago"}`;
  else if (absSec < 86400 * 2 && !future) rel = "yesterday";
  else rel = `${Math.round(absSec / 86400)}d ${future ? "from now" : "ago"}`;
  const abs = d.toLocaleTimeString("id-ID", { timeZone: WIB_TZ, hour12: false }) +
    " · " + d.toLocaleDateString("id-ID", { timeZone: WIB_TZ }) + " WIB";
  return `${rel} (${abs})`;
}

function AutomationStatusPanel({ agent, session }: { agent: any; session: any }) {
  if (!agent) return null;
  const lastRun = agent.last_worker_run_at ? new Date(agent.last_worker_run_at) : null;
  const ageMs = lastRun ? Date.now() - lastRun.getTime() : null;
  const automationEnabled = agent.automation_enabled !== false;
  const isOpen = !!session?.isOpen;
  // Worker considered fresh if heartbeat within 3 minutes (cron runs every 1m).
  const workerFresh = ageMs !== null && ageMs <= 180_000;
  const workerStale = automationEnabled && (!lastRun || (ageMs !== null && ageMs > 180_000));

  const cronUrl = typeof window !== "undefined"
    ? `${window.location.origin}/api/public/cron/ai-agent`
    : "/api/public/cron/ai-agent";

  let state: { label: string; cls: string; msg: string };
  if (!automationEnabled) {
    state = { label: "MANUAL / INACTIVE", cls: "bg-muted text-muted-foreground",
      msg: "Automation disabled. Agent will not trade automatically." };
  } else if (workerStale) {
    state = { label: "AUTO STALE", cls: "bg-bear/15 text-bear",
      msg: `Worker stale — scheduler is not calling /api/public/cron/ai-agent. Configure cron to call this endpoint every 1 minute.` };
  } else if (agent.last_worker_status === "error") {
    state = { label: "AUTO ERROR", cls: "bg-bear/15 text-bear",
      msg: agent.last_worker_message ?? "Worker reported an error on the last cycle." };
  } else if (!isOpen && workerFresh) {
    state = { label: "AUTO IDLE — MARKET CLOSED", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
      msg: "Worker active — market closed, no new paper order." };
  } else {
    state = { label: "AUTO RUNNING", cls: "bg-bull/15 text-bull",
      msg: "AI worker active — decisions run automatically." };
  }

  const testCron = async () => {
    try {
      const j = await testAIAgentCronServer();
      if (!j.ok) {
        if (j.status === 401) {
          toast.error("Cron returned 401: missing/invalid x-cron-secret");
          toast.info("Cron endpoint reachable, but request was rejected because x-cron-secret is missing or invalid. Your scheduler must send header: x-cron-secret");
        } else if (j.error === "cron_secret_not_configured") {
          toast.error("CRON_SECRET not set");
          toast.info("Add CRON_SECRET in project secrets, then schedule the cron with that secret in the x-cron-secret header.");
        } else {
          toast.error(`Cron failed (${j.status}): ${j.message ?? j.error}`);
        }
      } else {
        toast.success(`Cron OK — decisions=${j.decisions} executed=${j.executed} blocked=${j.blocked}`);
      }
    } catch (e: any) {
      toast.error(`Test cron error: ${e?.message ?? "unknown"}`);
    }
  };

  const copyCronUrl = async () => {
    try { await navigator.clipboard.writeText(cronUrl); toast.success("Cron URL copied"); }
    catch { toast.error("Copy failed"); }
  };

  return (
    <div className="panel p-3 space-y-2 border border-dashed">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase text-muted-foreground">Automation Status</span>
          <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${state.cls}`}>{state.label}</span>
        </div>
        <span className="text-[10px] text-muted-foreground font-mono">{cronUrl}</span>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{state.msg}</p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
        <div><span className="text-muted-foreground">Automation:</span> <span className="font-mono">{automationEnabled ? "enabled" : "disabled"}</span></div>
        <div className="md:col-span-2"><span className="text-muted-foreground">Last worker run:</span> <span className="font-mono">{formatRelativeWIB(agent.last_worker_run_at)}</span></div>
        <div className="md:col-span-2"><span className="text-muted-foreground">Next expected:</span> <span className="font-mono">{formatRelativeWIB(agent.next_expected_worker_run_at)}</span></div>
        <div><span className="text-muted-foreground">Worker errors:</span> <span className="font-mono">{agent.worker_error_count ?? 0}</span></div>
        <div className="md:col-span-2"><span className="text-muted-foreground">Last auto decision:</span> <span className="font-mono">{formatRelativeWIB(agent.last_auto_decision_at)}</span></div>
        <div className="md:col-span-2"><span className="text-muted-foreground">Last auto execution:</span> <span className="font-mono">{formatRelativeWIB(agent.last_auto_execution_at)}</span></div>
      </div>
      {agent.last_blocked_reason && (
        <div className="text-xs">
          <span className="text-muted-foreground">Last blocked reason: </span>
          <span className="font-mono">{agent.last_blocked_reason}</span>
        </div>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" variant="outline" onClick={testCron}>Test cron now</Button>
        <Button size="sm" variant="outline" onClick={copyCronUrl}>Copy cron URL</Button>
      </div>
      <div className="text-[11px] text-muted-foreground leading-relaxed border border-dashed rounded p-2 space-y-0.5">
        <div><span className="font-semibold">Endpoint:</span> <code className="font-mono">{cronUrl}</code></div>
        <div><span className="font-semibold">Required header:</span> <code className="font-mono">x-cron-secret: &lt;CRON_SECRET&gt;</code> (or <code className="font-mono">Authorization: Bearer &lt;CRON_SECRET&gt;</code>)</div>
        <div>Schedule every 1 minute. Paper Trading only — no real-money execution.</div>
      </div>
      {workerStale && (
        <div className="text-[11px] text-amber-600 dark:text-amber-400 leading-relaxed border border-amber-500/30 bg-amber-500/5 rounded p-2">
          <strong>Action required:</strong> An external scheduler (pg_cron or platform cron) must call
          <code className="mx-1 font-mono">{cronUrl}</code>
          every 1 minute with header <code className="font-mono">x-cron-secret: &lt;CRON_SECRET&gt;</code>.
          The "Manual run now" button is a debug shortcut and does not replace the automatic schedule.
        </div>
      )}
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
  const agentPositions = ((status.data as any)?.paperPositions ?? []) as any[];
  const agentOrders = ((status.data as any)?.agentOrders ?? []) as any[];
  const orderCounts = ((status.data as any)?.orderCounts ?? { executed: 0, openPositions: 0, closedTrades: 0 }) as { executed: number; openPositions: number; closedTrades: number };

  const memory = useQuery({
    queryKey: ["ai-agent-memory", agent?.id],
    queryFn: () => listTradeMemory({ data: { agentId: agent.id } }),
    enabled: !!agent?.id,
    refetchInterval: 15000,
  });
  const memoryRows = (memory.data ?? []) as any[];

  const [symbols, setSymbols] = useState<string[]>(["BBCA.JK", "BBRI.JK", "TLKM.JK", "ASII.JK", "BMRI.JK"]);
  const [alloc, setAlloc] = useState("1000000");
  const [risk, setRisk] = useState<"conservative" | "balanced" | "aggressive">("balanced");
  const [conf, setConf] = useState("0.70");
  const [feedFilter, setFeedFilter] = useState<FeedFilter>("active");

  // Set of symbols with an actual open position (paper_positions). Used to
  // enforce HOLD semantics in the UI even if a legacy decision row says HOLD.
  const openPositionSymbols = new Set<string>(agentPositions.map((p: any) => String(p.symbol)));

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
      maxActivePositions: 10,
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
  const repairLabels = useMutation({
    mutationFn: () => repairAITrainingEventLabels({ data: { limit: 1000 } }),
    onSuccess: (r: any) => { toast.success(`Repair: scanned ${r.scanned}, repaired ${r.repaired}`); status.refetch(); },
    onError: (e: any) => toast.error(e?.message ?? "Repair failed"),
  });

  const isActive = agent && agent.status !== "stopped" && agent.status !== "error";
  const runCopy = runButtonCopy(agent, session);
  const selectedSet = new Set((agent?.selected_symbols ?? symbols) as string[]);
  const trainingBadge = decisions.length > 0
    ? { label: "Training Data Saved", cls: "bg-bull/15 text-bull" }
    : { label: "Waiting for Training Data", cls: "bg-muted text-muted-foreground" };

  // Data Readiness — aggregated across active candidates (selectedSet) and open
  // positions. A single fresh candidate should NOT show as "unavailable".
  const activeSyms = new Set<string>([
    ...((agent?.selected_symbols ?? symbols) as string[]),
    ...agentPositions.map((p: any) => p.symbol),
  ]);
  const activeDecisions: any[] = [];
  {
    const seen = new Set<string>();
    for (const d of decisions) {
      if (!activeSyms.has(d.symbol)) continue;
      if (seen.has(d.symbol)) continue;
      seen.add(d.symbol);
      activeDecisions.push(d);
    }
  }
  function aggregate(values: DataStatus[]): DataStatus {
    if (values.length === 0) return "unavailable";
    const fresh = values.filter(v => v === "fresh").length;
    const stale = values.filter(v => v === "stale").length;
    if (fresh === values.length) return "fresh";
    if (fresh > 0) return "stale"; // partial → render as amber/stale
    if (stale > 0) return "stale";
    return "unavailable";
  }
  const perSymStatus = activeDecisions.map(d => {
    const snap: any = d.data_snapshot ?? {};
    const tech: any = d.technical_snapshot ?? {};
    const sent: any = d.sentiment_snapshot ?? {};
    return {
      price: (snap?.price ? classifyFreshness(d.data_freshness_seconds) : "unavailable") as DataStatus,
      tech: (tech && (tech.score != null || tech.label) ? "fresh" : "unavailable") as DataStatus,
      news: (Number(sent?.news?.latestNewsCount ?? 0) > 0 ? "fresh" : "unavailable") as DataStatus,
      sent: (sent?.news ? "fresh" : "unavailable") as DataStatus,
      disc: (sent?.disclosure?.hasRecentDisclosure ? "fresh" : sent?.disclosure ? "stale" : "unavailable") as DataStatus,
    };
  });
  const priceStatus: DataStatus = aggregate(perSymStatus.map(s => s.price));
  const techStatus: DataStatus = aggregate(perSymStatus.map(s => s.tech));
  const newsStatus: DataStatus = aggregate(perSymStatus.map(s => s.news));
  const sentStatus: DataStatus = aggregate(perSymStatus.map(s => s.sent));
  const discStatus: DataStatus = aggregate(perSymStatus.map(s => s.disc));
  const newestDecision = decisions[0];
  const execAllowed = !!session?.isOpen && agent?.status !== "paused" && agent?.status !== "error" && agent?.status !== "stopped";

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
                <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${trainingBadge.cls}`}>{trainingBadge.label}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                Status: <span className="font-mono">{agent?.status ?? "stopped"}</span> · IDX session: <span className="font-mono">{session?.label ?? "—"}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {!isActive && <Button size="sm" onClick={() => start.mutate()} disabled={start.isPending}><Play className="size-3 mr-1" />Start</Button>}
            {isActive && agent.status !== "paused" && <Button size="sm" variant="outline" onClick={() => pause.mutate()}><Pause className="size-3 mr-1" />Pause</Button>}
            {isActive && <Button size="sm" variant="outline" onClick={() => tick.mutate()} disabled={tick.isPending} title={runCopy.tip}>{runCopy.label}</Button>}
            {isActive && <Button size="sm" variant="outline" onClick={() => stop.mutate()}><Square className="size-3 mr-1" />Stop</Button>}
            {isActive && <Button size="sm" variant="destructive" onClick={() => estop.mutate()}><AlertTriangle className="size-3 mr-1" />Emergency</Button>}
          </div>
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          AI Agent menggunakan data pasar, berita, sentimen, dan harga aktual sebagai bahan analisis.
          Namun seluruh transaksi dilakukan hanya di Paper Trading menggunakan saldo virtual — tidak ada eksekusi real-money,
          tidak terhubung ke broker, dan tidak ada order ke sekuritas.
        </p>

        <AutomationStatusPanel agent={agent} session={session} />

        <AutonomousModeControls agent={agent} onChange={() => status.refetch()} />

        <div className="grid md:grid-cols-4 gap-2">
          {(agent?.symbol_selection_mode ?? "manual") !== "autonomous" && (
            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground">Emiten (maks {MAX_AGENT_SYMBOLS}) {isActive && <span className="text-[10px] text-primary">· perubahan langsung diterapkan ke agent</span>}</label>
              <TickerSearch
                placeholder="Cari emiten (BBCA.JK, AAPL, …)"
                onPick={(sym) => addSymbol(sym)}
              />
              <div className="flex flex-wrap gap-1 mt-2 min-h-6">
                {symbols.length === 0 && <span className="text-xs text-muted-foreground">Belum ada emiten dipilih.</span>}
                {symbols.map(s => (
                  <span key={s} className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded bg-accent text-xs font-mono">
                    {s}
                    <button
                      type="button"
                      onClick={() => removeSymbol(s)}
                      className="inline-flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded bg-destructive/10 text-destructive hover:bg-destructive hover:text-destructive-foreground transition-colors"
                      aria-label={`Hentikan AI Agent untuk ${s}`}
                      title={isActive ? `Hentikan AI Agent untuk ${s}` : `Hapus ${s}`}
                    >
                      <Square className="size-2.5 fill-current" />
                      <span className="text-[10px] font-sans font-medium">Stop</span>
                    </button>
                  </span>
                ))}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">{symbols.length}/{MAX_AGENT_SYMBOLS} dipilih</div>
            </div>
          )}
          {(agent?.symbol_selection_mode ?? "manual") === "autonomous" && (
            <div className="md:col-span-2">
              <AutonomousScannerPanel agent={agent} />
            </div>
          )}
          {!isActive && <div><label className="text-xs text-muted-foreground">Allocation / trade (IDR)</label><Input type="number" value={alloc} onChange={e => setAlloc(e.target.value)} /></div>}
          {!isActive && (
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
          )}
          {!isActive && <div><label className="text-xs text-muted-foreground">Min confidence (0–1)</label><Input value={conf} onChange={e => setConf(e.target.value)} /></div>}
        </div>
      </div>

      {/* Data Readiness Card — aggregated across active candidates + open positions */}
      <div className="panel p-3 space-y-2" title="Aggregated from active candidates and open positions.">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="text-xs font-semibold uppercase tracking-wide">Data Readiness <span className="text-[10px] normal-case text-muted-foreground font-normal">· aggregated</span></div>
          <div className="text-[10px] text-muted-foreground">
            Last update: {newestDecision ? fmtWIBTime(newestDecision.created_at) : "—"} · {activeDecisions.length} active
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 text-[11px]">
          {[
            { k: "Price",       v: priceStatus },
            { k: "Technical",   v: techStatus },
            { k: "News",        v: newsStatus },
            { k: "Sentiment",   v: sentStatus },
            { k: "Disclosure",  v: discStatus },
          ].map(item => (
            <div key={item.k} className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-muted/30" title="Aggregated from active candidates and open positions.">
              <span className="text-muted-foreground">{item.k}</span>
              <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${statusBadgeClass(item.v)}`}>{item.v === "stale" && perSymStatus.some(s => (s as any)[item.k.toLowerCase()] === "fresh") ? "partial" : item.v}</span>
            </div>
          ))}
          <div className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-muted/30">
            <span className="text-muted-foreground">Market</span>
            <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${session?.isOpen ? "bg-bull/15 text-bull" : session?.isBreak ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-muted text-muted-foreground"}`}>
              {session?.label ?? "—"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-muted/30">
            <span className="text-muted-foreground">Execution</span>
            <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${execAllowed ? "bg-bull/15 text-bull" : "bg-bear/15 text-bear"}`}>
              {execAllowed ? "Allowed" : "Blocked"}
            </span>
          </div>
        </div>
      </div>

      {/* Open Positions panel — source of truth: paper_positions */}
      <div className="panel p-2 overflow-x-auto">
        <div className="px-2 py-1 text-xs text-muted-foreground flex items-center justify-between flex-wrap gap-2">
          <span className="flex items-center gap-2">
            <span className="font-semibold uppercase tracking-wide text-foreground">Open Positions</span>
            <span className="text-[10px] uppercase bg-bull/15 text-bull px-1.5 py-0.5 rounded">{agentPositions.length} open</span>
          </span>
          <span className="text-[10px] text-muted-foreground">source: paper_positions</span>
        </div>
        {agentPositions.length === 0 ? (
          <div className="p-3 text-xs text-muted-foreground">Belum ada open position. AI belum mengeksekusi paper BUY.</div>
        ) : (
          <table className="w-full text-sm min-w-[720px]">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="text-left p-2">Symbol</th>
                <th className="text-right p-2">Lot</th>
                <th className="text-right p-2">Shares</th>
                <th className="text-right p-2">Avg Entry</th>
                <th className="text-right p-2">Last Price</th>
                <th className="text-right p-2">Market Value</th>
                <th className="text-right p-2">Unrealized P/L</th>
                <th className="text-right p-2">Opened</th>
              </tr>
            </thead>
            <tbody>
              {agentPositions.map((p: any) => {
                const qty = Number(p.qty);
                const lot = Math.floor(qty / 100);
                const mark = Number(p.mark ?? p.avg_price);
                const mv = mark * qty;
                return (
                  <tr key={p.id} className="border-t border-border">
                    <td className="p-2 font-mono">{p.symbol}</td>
                    <td className="p-2 text-right font-mono">{lot}</td>
                    <td className="p-2 text-right font-mono">{qty}</td>
                    <td className="p-2 text-right font-mono">{formatPrice(p.avg_price)}</td>
                    <td className="p-2 text-right font-mono">{formatPrice(mark)}</td>
                    <td className="p-2 text-right font-mono">{formatIDRCompact(mv)}</td>
                    <td className={`p-2 text-right font-mono ${colorForChange(p.pnl ?? 0)}`}>{p.pnl != null ? formatIDRCompact(p.pnl) : "—"}{p.pnlPct != null ? ` (${Number(p.pnlPct).toFixed(2)}%)` : ""}</td>
                    <td className="p-2 text-right text-xs text-muted-foreground">{fmtWIBDateTime(p.opened_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Performance */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <Stat label="Closed trades" value={String(orderCounts.closedTrades)} />
        <Stat label="Executed orders" value={String(orderCounts.executed)} />
        <Stat label="Open positions" value={String(orderCounts.openPositions)} tone={orderCounts.openPositions > 0 ? "bull" : undefined} />
        <Stat
          label="Win rate"
          value={orderCounts.closedTrades === 0 ? "N/A" : Number(performance?.win_rate ?? 0).toFixed(1) + "%"}
          tone={orderCounts.closedTrades === 0 ? undefined : Number(performance?.win_rate ?? 0) >= 50 ? "bull" : "bear"}
        />
        <Stat
          label="Profit factor"
          value={orderCounts.closedTrades === 0 ? "N/A" : Number(performance?.profit_factor ?? 0).toFixed(2)}
        />
      </div>
      {orderCounts.closedTrades === 0 && (
        <div className="panel p-3 text-xs text-muted-foreground flex items-center justify-between flex-wrap gap-2">
          <span>
            {orderCounts.executed > 0
              ? `Sudah ada ${orderCounts.executed} paper order tereksekusi dan ${orderCounts.openPositions} open position. Belum ada closed trade — win rate dan profit factor akan dihitung setelah posisi pertama ditutup.`
              : "Belum ada closed trade. Win rate dan profit factor akan dihitung setelah posisi pertama ditutup."}
          </span>
          <span className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={repairLabels.isPending} onClick={() => repairLabels.mutate()}>
              {repairLabels.isPending ? "Repairing…" : "Repair AI Learning Labels"}
            </Button>
            <span className="text-[10px] uppercase bg-muted px-1.5 py-0.5 rounded">{orderCounts.executed > 0 ? "Waiting for first close" : "Waiting for first executed trade"}</span>
          </span>
        </div>
      )}

      {memoryRows.length > 0 && (
        <div className="panel p-2 overflow-x-auto">
          <div className="px-2 py-1 text-xs text-muted-foreground flex items-center gap-2">
            <span>Trade Memory per emiten</span>
            <span className="text-[10px] uppercase bg-primary/10 text-primary px-1.5 py-0.5 rounded">Calibration input</span>
          </div>
          <table className="w-full text-sm min-w-[720px]">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="text-left p-2">Symbol</th>
                <th className="text-right p-2">Win rate</th>
                <th className="text-right p-2">Avg return</th>
                <th className="text-right p-2">Samples</th>
                <th className="text-left p-2">Best strategy</th>
                <th className="text-left p-2">Worst strategy</th>
                <th className="text-left p-2">Last result · Recent mistake</th>
              </tr>
            </thead>
            <tbody>
              {memoryRows.map((m) => {
                const wr = Number(m.recent_win_rate ?? 0);
                const ar = Number(m.recent_avg_return ?? 0);
                const n = Number(m.sample_size ?? 0);
                let lastResult: string = (m.last_trade_result ?? "—");
                // UI guards: insufficient sample, or inconsistent avg/last result
                if (n === 0) lastResult = "—";
                else if (ar < 0 && lastResult === "win") lastResult = "loss";
                const lastResultClass =
                  lastResult === "win" ? "text-bull"
                  : lastResult === "loss" ? "text-bear"
                  : "text-muted-foreground";
                return (
                  <tr key={m.id} className="border-t border-border/40">
                    <td className="p-2 font-mono">{m.symbol}</td>
                    <td className={`p-2 text-right font-mono ${n === 0 ? "text-muted-foreground" : wr >= 50 ? "text-bull" : "text-bear"}`}>
                      {n === 0 ? "—" : `${wr.toFixed(1)}%`}
                    </td>
                    <td className={`p-2 text-right font-mono ${n === 0 ? "text-muted-foreground" : ar >= 0 ? "text-bull" : "text-bear"}`}>
                      {n === 0 ? "—" : `${ar.toFixed(2)}%`}
                    </td>
                    <td className="p-2 text-right font-mono">{n === 0 ? <span className="text-muted-foreground" title="Insufficient sample">—</span> : n}</td>
                    <td className="p-2 text-xs">{m.best_strategy ?? "—"}</td>
                    <td className="p-2 text-xs">{m.worst_strategy ?? "—"}</td>
                    <td className="p-2 text-xs">
                      <span className={lastResultClass}>{lastResult}</span>
                      {m.recent_mistake ? <span className="text-muted-foreground"> · {m.recent_mistake}</span> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Trade Plan: only emiten currently in selectedSymbols. */}
      {(() => {
        const latestPerSymbol = new Map<string, any>();
        for (const d of decisions) if (!latestPerSymbol.has(d.symbol)) latestPerSymbol.set(d.symbol, d);
        const cards = Array.from(selectedSet).map(sym => latestPerSymbol.get(sym) ?? { symbol: sym, _placeholder: true });
        if (cards.length === 0) return null;
        return (
          <div>
            <div className="text-xs text-muted-foreground px-1 pb-2 flex items-center gap-2">
              <span>Trade Plan terkini per emiten</span>
              <span className="text-[10px] uppercase bg-primary/10 text-primary px-1.5 py-0.5 rounded">Pre-execution plan</span>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-2">
              {cards.map((d: any) => {
                if (d._placeholder) {
                  return (
                    <div key={d.symbol} className="panel p-3 space-y-2 border border-border opacity-80">
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-mono font-semibold">{d.symbol}</div>
                        <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Menunggu</span>
                      </div>
                      <div className="text-[11px] text-muted-foreground">Menunggu refresh data berikutnya untuk menghasilkan trade plan.</div>
                    </div>
                  );
                }
                const isBuy = d.action === "BUY";
                const isExit = d.action === "EXIT" || d.action === "SELL";
                const isHold = d.action === "HOLD";
                const executed = isExecutedDecision(d);
                const entry = executed && d.entry_price != null ? Number(d.entry_price) : null;
                const refPrice = referencePriceFor(d);
                const sl = executed && d.stop_loss != null ? Number(d.stop_loss) : null;
                const tp = executed && d.take_profit != null ? Number(d.take_profit) : null;
                const rr = executed && d.risk_reward_ratio != null ? Number(d.risk_reward_ratio) : null;
                const conf = confidenceCell(agent, session, d);
                const exec = deriveExecutionStatusForCard(agent, session, d);
                const snap: any = d.data_snapshot ?? {};
                const tech: any = d.technical_snapshot ?? {};
                const sent: any = d.sentiment_snapshot ?? {};
                const dPrice: DataStatus = snap?.price ? classifyFreshness(d.data_freshness_seconds) : "unavailable";
                const dTech: DataStatus = tech?.label || tech?.score != null ? "fresh" : "unavailable";
                const dNews: DataStatus = Number(sent?.news?.latestNewsCount ?? 0) > 0 ? "fresh" : "unavailable";
                const dSent: DataStatus = sent?.news ? "fresh" : "unavailable";
                const da = displayActionFor(d, exec.status, openPositionSymbols);
                const cardKind = executed && isBuy
                  ? { label: "OPEN POSITION", cls: "bg-bull/15 text-bull" }
                  : executed && isExit
                  ? { label: "EXIT", cls: "bg-bear/15 text-bear" }
                  : exec.status === "hold_position"
                  ? { label: "OPEN POSITION", cls: "bg-bull/10 text-bull" }
                  : exec.status === "watch_snapshot"
                  ? { label: "WATCH", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" }
                  : exec.status === "research_snapshot"
                  ? { label: "RESEARCH", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400" }
                  : exec.status === "premarket_snapshot"
                  ? { label: "PRE-MARKET", cls: "bg-primary/10 text-primary" }
                  : exec.status.startsWith("blocked_")
                  ? { label: "BLOCKED", cls: "bg-bear/10 text-bear" }
                  : { label: da.label, cls: TONE_BADGE[da.tone] };
                return (
                  <div key={d.id} className={`panel p-3 space-y-2 border ${executed && isBuy ? "border-bull/40" : executed && isExit ? "border-bear/40" : "border-border"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-mono font-semibold">{d.symbol}</div>
                      <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${cardKind.cls}`} title={conf.tooltip}>
                        {cardKind.label}{da.intent && !executed && exec.status !== "hold_position" ? ` · intent ${da.intent}` : ""} · {conf.label}
                      </span>
                    </div>
                    {executed && (
                      <div className="grid grid-cols-3 gap-1 text-[11px]">
                        <div><div className="text-muted-foreground">Entry</div><div className="font-mono">{entry != null ? formatPrice(entry) : "—"}</div></div>
                        <div><div className="text-muted-foreground">SL</div><div className="font-mono text-bear">{sl != null ? formatPrice(sl) : "—"}</div></div>
                        <div><div className="text-muted-foreground">TP</div><div className="font-mono text-bull">{tp != null ? formatPrice(tp) : "—"}</div></div>
                        <div><div className="text-muted-foreground">Lot</div><div className="font-mono">{d.suggested_lot ?? "—"}</div></div>
                        <div><div className="text-muted-foreground">Shares</div><div className="font-mono">{d.suggested_shares ?? "—"}</div></div>
                        <div><div className="text-muted-foreground">RR</div><div className="font-mono">{rr != null ? rr.toFixed(2) : "—"}</div></div>
                      </div>
                    )}
                    {!executed && (
                      <div className="text-[11px] bg-amber-500/10 text-amber-700 dark:text-amber-400 px-2 py-1.5 rounded space-y-1">
                        <div className="font-semibold uppercase text-[9px] tracking-wide">{isHold ? "Monitoring only · No paper order" : "No paper order executed"}</div>
                        <div className="font-semibold">{exec.primary}</div>
                        <div className="text-muted-foreground">{exec.detail}</div>
                        {refPrice != null && (
                          <div className="text-[10px] font-mono opacity-90">Ref price: {formatPrice(refPrice)}{dPrice === "stale" ? " · cached" : ""}</div>
                        )}
                        {exec.secondary && <div className="text-[10px] opacity-80">↳ {exec.secondary}</div>}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
                      <div className="flex justify-between"><span className="text-muted-foreground">Price</span><span className={statusBadgeClass(dPrice).split(" ")[1]}>{dPrice}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Technical</span><span className={statusBadgeClass(dTech).split(" ")[1]}>{dTech}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">News</span><span className={statusBadgeClass(dNews).split(" ")[1]}>{dNews}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Sentiment</span><span className={statusBadgeClass(dSent).split(" ")[1]}>{dSent}</span></div>
                    </div>
                    <div className="text-[10px] text-muted-foreground flex items-center justify-between">
                      <span title={d.data_source ?? ""}>{d.data_source ?? "Source belum tersedia"}</span>
                      <span>{fmtWIBTime(d.created_at)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      <div className="panel p-2 overflow-x-auto">
        <div className="px-2 py-1 text-xs text-muted-foreground flex items-center justify-between flex-wrap gap-2">
          <span className="font-semibold uppercase tracking-wide text-foreground">Decision feed</span>
          <div className="flex items-center gap-1 flex-wrap">
            {FEED_FILTER_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setFeedFilter(opt.value)}
                className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded border transition-colors ${
                  feedFilter === opt.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/30 text-muted-foreground border-transparent hover:border-border"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <table className="w-full text-sm min-w-[960px]">
          <thead className="text-xs text-muted-foreground">
            <tr><th className="text-left p-2">Time</th><th className="text-left p-2">Symbol</th>
              <th className="text-left p-2">Mode</th>
              <th className="text-left p-2">Action</th>
              <th className="text-left p-2">Intent</th>
              <th className="text-right p-2">Conf (raw→cal)</th><th className="text-right p-2">Lot</th>
              <th className="text-right p-2">Entry / Ref</th><th className="text-right p-2">SL</th><th className="text-right p-2">TP</th>
              <th className="text-left p-2">Source · Fresh</th>
              <th className="text-left p-2">Status</th><th className="text-left p-2">Reasoning</th></tr>
          </thead>
          <tbody>
            {(() => {
              // Apply Decision Feed filter. "Active" hides previous-session rows
              // (symbols no longer selected/held); the other filters slice by
              // execution kind so previous-session noise never leaks into the
              // active trade plan view.
              const filtered = decisions.filter((d: any) => {
                const exec = deriveExecutionStatusForCard(agent, session, d);
                const inactive = !selectedSet.has(d.symbol) && !openPositionSymbols.has(d.symbol);
                const isExecRow = ["executed_buy","executed_sell","executed_exit","executed_stop_loss","executed_take_profit"].includes(exec.status);
                const isOpenPosEvt = exec.status === "hold_position" || (isExecRow && exec.status === "executed_buy");
                const isBlocked = exec.status.startsWith("blocked_");
                const isWatchResearch = ["watch_snapshot","research_snapshot","premarket_snapshot"].includes(exec.status);
                switch (feedFilter) {
                  case "active":          return !inactive;
                  case "executed":        return isExecRow;
                  case "open_position":   return isOpenPosEvt;
                  case "blocked":         return isBlocked;
                  case "watch_research":  return isWatchResearch;
                  case "previous":        return inactive;
                  case "all":
                  default:                return true;
                }
              });
              if (filtered.length === 0) {
                return (
                  <tr><td colSpan={13} className="p-6 text-center text-muted-foreground text-xs">
                    {decisions.length === 0
                      ? `Belum ada keputusan. Klik "${runCopy.label}" untuk memulai analysis cycle.`
                      : `Tidak ada decision pada filter "${FEED_FILTER_OPTIONS.find(o => o.value === feedFilter)?.label}". Coba filter lain.`}
                  </td></tr>
                );
              }
              return filtered.map((d: any) => {
                const conf = confidenceCell(agent, session, d);
                const fresh = d.data_freshness_seconds;
                const inactive = !selectedSet.has(d.symbol) && !openPositionSymbols.has(d.symbol);
                const exec = deriveExecutionStatusForCard(agent, session, d);
                const executed = isExecutedDecision(d);
                const refPrice = referencePriceFor(d);
                const lotNum = Number(d.suggested_lot ?? 0);
                const mode = String(d.selection_mode ?? "manual");
                const intent = signalIntentFor(d);

                const snap: any = d.data_snapshot ?? {};
                const priceFreshness: DataStatus = snap?.price ? classifyFreshness(fresh) : (refPrice != null ? "stale" : "unavailable");
                const sourceLabel = priceFreshness === "unavailable"
                  ? "Price unavailable"
                  : priceFreshness === "stale"
                  ? (refPrice != null && !snap?.price ? "Reference price (cached)" : "Stale price")
                  : "Price fresh";

                const isExecutedRow = ["executed_buy","executed_sell","executed_exit","executed_stop_loss","executed_take_profit"].includes(exec.status);
                const isSnapshotRow = ["watch_snapshot","research_snapshot","premarket_snapshot"].includes(exec.status);
                const badgeClass = isExecutedRow
                  ? "bg-bull/15 text-bull"
                  : isSnapshotRow
                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
                  : exec.status === "allowed"
                  ? "bg-bull/15 text-bull"
                  : "bg-bear/10 text-bear";

                const reasoningPretty = executed
                  ? (d.reasoning ?? "—")
                  : `${exec.primary}. ${exec.detail}`;
                const lotNote = lotNum === 0 ? lotZeroExplanation(exec.status) : null;
                const da = displayActionFor(d, exec.status, openPositionSymbols);
                const entryCell = executed && d.entry_price != null
                  ? <span className="font-semibold">{formatPrice(d.entry_price)}</span>
                  : refPrice != null
                  ? <span className="text-muted-foreground" title="Reference / scan price — not an executed entry">Ref {formatPrice(refPrice)}{priceFreshness === "stale" ? " · cached" : ""}</span>
                  : <span className="text-muted-foreground">—</span>;

                return (
                  <tr key={d.id} className="border-t border-border align-top">
                    <td className="p-2 text-xs text-muted-foreground whitespace-nowrap">{fmtWIBTime(d.created_at)}</td>
                    <td className="p-2 font-medium">
                      {d.symbol}
                      {inactive && <span className="ml-1 text-[9px] uppercase bg-muted text-muted-foreground px-1 py-0.5 rounded align-middle">previous</span>}
                    </td>
                    <td className="p-2 text-[10px] uppercase text-muted-foreground">{mode}</td>
                    <td className="p-2 text-xs font-semibold">
                      <span className={TONE_TEXT[da.tone]}>{da.label}</span>
                    </td>
                    <td className="p-2 text-[10px] uppercase">
                      {intent === "NONE"
                        ? <span className="text-muted-foreground">—</span>
                        : <span className={intent === "BUY" ? "text-bull" : intent === "SELL" || intent === "EXIT" ? "text-bear" : "text-amber-600 dark:text-amber-400"}>{intent}</span>}
                    </td>
                    <td className={`p-2 text-right font-mono text-xs ${conf.muted ? "text-muted-foreground" : ""}`} title={conf.tooltip}>{conf.label}</td>
                    <td className="p-2 text-right font-mono" title={lotNote ?? ""}>
                      {executed ? (d.suggested_lot ?? "—") : "0"}
                      {lotNote && <div className="text-[9px] font-sans text-muted-foreground italic max-w-[140px] whitespace-normal text-right">{lotNote}</div>}
                    </td>
                    <td className="p-2 text-right font-mono text-xs">{entryCell}</td>
                    <td className="p-2 text-right font-mono">{executed && d.stop_loss != null ? formatPrice(d.stop_loss) : "—"}</td>
                    <td className="p-2 text-right font-mono">{executed && d.take_profit != null ? formatPrice(d.take_profit) : "—"}</td>
                    <td className="p-2 text-[11px] text-muted-foreground max-w-[200px]" title={d.data_source ?? ""}>
                      <div className="truncate">{sourceLabel}{fresh != null ? ` · ${fresh}s` : ""}</div>
                    </td>
                    <td className="p-2 text-xs">
                      <span className={`text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded ${badgeClass}`}>
                        {EXEC_LABEL[exec.status]}
                      </span>
                    </td>
                    <td className="p-2 text-xs text-muted-foreground max-w-md">
                      {reasoningPretty}
                      {d.calibration_reason ? <div className="mt-1 text-[10px] italic opacity-80">↳ {d.calibration_reason}</div> : null}
                    </td>
                  </tr>
                );
              });
            })()}
          </tbody>
        </table>
      </div>

      <div className="panel p-2">
        <div className="px-2 py-1 text-xs text-muted-foreground">Risk guard log</div>
        <ul className="text-xs divide-y divide-border">
          {risks.map((r: any) => (
            <li key={r.id} className="p-2 flex justify-between gap-2">
              <span><span className="font-semibold uppercase">{r.risk_type}</span> · {r.symbol ?? ""} — {r.message}</span>
              <span className="text-muted-foreground">{fmtWIBDateTime(r.created_at)}</span>
            </li>
          ))}
          {risks.length === 0 && <li className="p-3 text-center text-muted-foreground">Belum ada event risiko.</li>}
        </ul>
      </div>
    </div>
  );
}

function AICoach() {
  return (
    <div className="panel p-4">
      <p className="text-sm text-muted-foreground mb-3">Ask the AI to review your trades, suggest improvements, or generate a strategy idea.</p>
      <ChatPanel system="You are an institutional trading coach inside Quanta Terminal (paper trading only). Review the user's described trades, point out mistakes (sizing, timing, risk), and suggest concrete improvements. Use markdown bullets. HARD RULE: follow the GLOBAL FUNDAMENTAL & DISCLOSURE GUARD prepended by the system — never invent PER/PBV/ROE/DER/dividend yield, never call any ticker 'undervalue' or 'fundamental kuat' without validated data, never assign Value Trap Risk Low/Medium/High when data is insufficient (use 'Unknown'). For missing metrics write 'N/A'. Scanner/sector/momentum signals are NOT fundamental validation — label such candidates as 'Kandidat Pantauan Non-Fundamental'. If user asks about undervalue, answer identically to the AI Trading Analyst." />
    </div>
  );
}

function Backtester() {
  const [symbol, setSymbol] = useState("AAPL");
  const [tf, setTf] = useState("1d");
  const [rule, setRule] = useState<"ema_cross" | "rsi_reversal" | "macd_cross">("ema_cross");
  const [strategyName, setStrategyName] = useState<StrategyName | "">("");
  const [sector, setSector] = useState("");
  const [regime, setRegime] = useState("");
  const [filterRegime, setFilterRegime] = useState("");
  const [filterSector, setFilterSector] = useState("");

  const run = useMutation({
    mutationFn: () => runBacktest({ data: {
      symbol: symbol.toUpperCase(), timeframe: tf, rule, persist: true,
      strategyName: strategyName || undefined,
      sector: sector || undefined,
      marketRegime: regime || undefined,
    } }),
    onSuccess: () => { perf.refetch(); toast.success("Backtest tersimpan ke Strategy Intelligence"); },
    onError: (e: any) => toast.error(e?.message ?? "Backtest failed"),
  });
  const m = (run.data as any)?.metrics;
  const [aiPrompt, setAiPrompt] = useState("");
  const gen = useMutation({
    mutationFn: () => generateStrategy({ data: { prompt: aiPrompt, symbol: symbol.toUpperCase() } }),
    onSuccess: (r: any) => { setRule(r.rule); toast.success(`AI picked: ${r.name}`); },
    onError: (e: any) => toast.error(e?.message ?? "AI failed"),
  });

  const perf = useQuery({
    queryKey: ["strategy_perf", filterRegime, filterSector],
    queryFn: () => listStrategyPerformance({ data: {
      regime: filterRegime || undefined,
      sector: filterSector || undefined,
    } }),
    refetchInterval: 60_000,
  });

  const STRATEGIES: StrategyName[] = [
    "momentum_breakout","pullback_to_support","trend_following","mean_reversion",
    "sector_rotation","defensive_rotation","dividend_momentum","undervalue_reversal",
    "news_catalyst","risk_off_cash_preservation",
  ];
  const SECTORS = ["Consumer","Financials","Healthcare","Telecom","Energy","Materials","Industrials","Tech","Real Estate","Utilities"];
  const REGIMES = ["risk_on","risk_off","neutral","transition","bullish","high_volatility"];

  const clsBadge = (c: string) =>
    c === "proven" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" :
    c === "promising" ? "bg-sky-500/20 text-sky-400 border-sky-500/40" :
    c === "avoid" || c === "underperforming" ? "bg-rose-500/20 text-rose-400 border-rose-500/40" :
    c === "unstable" ? "bg-amber-500/20 text-amber-400 border-amber-500/40" :
    "bg-slate-500/20 text-slate-400 border-slate-500/40";

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

      <div className="panel p-4 grid md:grid-cols-6 gap-2 items-end">
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
        <div>
          <label className="text-xs text-muted-foreground">Signal Rule</label>
          <Select value={rule} onValueChange={(v) => setRule(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ema_cross">EMA(12) × EMA(26)</SelectItem>
              <SelectItem value="rsi_reversal">RSI(14) reversal</SelectItem>
              <SelectItem value="macd_cross">MACD zero-cross</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Strategy label</label>
          <Select value={strategyName || "__none"} onValueChange={(v) => setStrategyName(v === "__none" ? "" : v as StrategyName)}>
            <SelectTrigger><SelectValue placeholder="(rule)" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">(use rule name)</SelectItem>
              {STRATEGIES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Sector</label>
          <Select value={sector || "__none"} onValueChange={(v) => setSector(v === "__none" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">—</SelectItem>
              {SECTORS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Market Regime</label>
          <Select value={regime || "__none"} onValueChange={(v) => setRegime(v === "__none" ? "" : v)}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">—</SelectItem>
              {REGIMES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-6">
          <Button onClick={() => run.mutate()} disabled={run.isPending}>{run.isPending ? "Running…" : "Run backtest & persist"}</Button>
          <span className="text-[11px] text-muted-foreground ml-2">Hasil dipakai AI Trade Agent untuk strategy scoring (paper trading only).</span>
        </div>
      </div>

      {m && (
        <div className="grid md:grid-cols-6 gap-2">
          <Stat label="Trades" value={m.trades.toString()} />
          <Stat label="Win rate" value={m.trades === 0 ? "N/A" : m.winRate.toFixed(1) + "%"} tone={m.trades === 0 ? undefined : m.winRate >= 50 ? "bull" : "bear"} />
          <Stat label="Total return" value={m.trades === 0 ? "0.00% (No trades)" : m.totalReturnPct.toFixed(2) + "%"} tone={m.trades === 0 ? undefined : m.totalReturnPct >= 0 ? "bull" : "bear"} />
          <Stat label="Max DD" value={m.trades === 0 ? "N/A" : "-" + m.maxDrawdownPct.toFixed(2) + "%"} tone={m.trades === 0 ? undefined : "bear"} />
          <Stat label="Sharpe" value={m.trades === 0 ? "N/A" : m.sharpe.toFixed(2)} />
          <Stat label="Profit factor" value={m.trades === 0 ? "N/A" : isFinite(m.profitFactor) ? m.profitFactor.toFixed(2) : "∞"} />
        </div>
      )}

      {run.data && (
        <div className="panel p-2 max-h-64 overflow-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground"><tr><th className="text-left p-2">Entry</th><th className="text-left p-2">Exit</th><th className="text-right p-2">Entry $</th><th className="text-right p-2">Exit $</th><th className="text-right p-2">PnL %</th></tr></thead>
            <tbody>
              {(run.data as any).trades.map((t: any, i: number) => (
                <tr key={i} className="border-t border-border">
                  <td className="p-2">{t.entryTime ? fmtWIBDate(t.entryTime * 1000) : "—"}</td>
                  <td className="p-2">{t.exitTime ? fmtWIBDate(t.exitTime * 1000) : "—"}</td>
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

      {/* Strategy Performance (Update 9) */}
      <div className="panel p-4 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <div className="text-sm font-semibold">Strategy Performance</div>
            <div className="text-[11px] text-muted-foreground">Backtest + forward (closed paper trades) aggregated per strategy.</div>
          </div>
          <div className="flex items-end gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground">Filter regime</label>
              <Select value={filterRegime || "__all"} onValueChange={(v) => setFilterRegime(v === "__all" ? "" : v)}>
                <SelectTrigger className="w-40 h-8"><SelectValue placeholder="all" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">all regimes</SelectItem>
                  {REGIMES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">Filter sector</label>
              <Select value={filterSector || "__all"} onValueChange={(v) => setFilterSector(v === "__all" ? "" : v)}>
                <SelectTrigger className="w-40 h-8"><SelectValue placeholder="all" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">all sectors</SelectItem>
                  {SECTORS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" variant="outline" onClick={() => perf.refetch()}>Refresh</Button>
          </div>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-2">
          {(perf.data ?? []).slice(0, 6).map((s: any) => (
            <div key={s.strategyName} className="rounded-md border border-border/60 p-3 text-xs space-y-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-foreground">{s.strategyName}</span>
                <span className={`px-1.5 py-0.5 rounded border text-[10px] uppercase ${clsBadge(s.classification)}`}>{s.classification}</span>
              </div>
              <div className="text-muted-foreground">
                Score <span className="text-foreground font-mono text-base">{s.strategyScore}</span> /100
              </div>
              <div className="text-muted-foreground">
                Sample <span className="font-mono">{s.sampleSize}</span> ({s.sampleQuality}) ·{" "}
                WR fwd {s.forwardWinRate != null ? `${Math.round(s.forwardWinRate)}%` : "—"} / bt {s.backtestWinRate != null ? `${Math.round(s.backtestWinRate)}%` : "—"}
              </div>
              <div className="text-muted-foreground">
                PF {s.profitFactor != null ? Number(s.profitFactor).toFixed(2) : "—"} ·{" "}
                Avg ret {s.avgReturn != null ? `${Number(s.avgReturn).toFixed(2)}%` : "—"} ·{" "}
                DD {s.maxDrawdown != null ? `${Number(s.maxDrawdown).toFixed(1)}%` : "—"}
              </div>
              {s.warnings?.length > 0 && (
                <div className="text-amber-400/80 text-[10px]">{s.warnings.join(" · ")}</div>
              )}
            </div>
          ))}
        </div>

        <div className="panel p-0 overflow-auto">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="text-left p-2">Strategy</th>
                <th className="text-right p-2">Score</th>
                <th className="text-right p-2">Class</th>
                <th className="text-right p-2">Sample</th>
                <th className="text-right p-2">WR fwd</th>
                <th className="text-right p-2">WR bt</th>
                <th className="text-right p-2">Avg ret</th>
                <th className="text-right p-2">PF</th>
                <th className="text-right p-2">Max DD</th>
              </tr>
            </thead>
            <tbody>
              {(perf.data ?? []).map((s: any) => (
                <tr key={s.strategyName} className="border-t border-border">
                  <td className="p-2 font-mono">{s.strategyName}</td>
                  <td className="p-2 text-right font-mono">{s.strategyScore}</td>
                  <td className="p-2 text-right"><span className={`px-1.5 py-0.5 rounded border text-[10px] uppercase ${clsBadge(s.classification)}`}>{s.classification}</span></td>
                  <td className="p-2 text-right font-mono">{s.sampleSize} <span className="text-muted-foreground text-[10px]">({s.sampleQuality})</span></td>
                  <td className="p-2 text-right font-mono">{s.forwardWinRate != null ? `${Math.round(s.forwardWinRate)}%` : "—"}</td>
                  <td className="p-2 text-right font-mono">{s.backtestWinRate != null ? `${Math.round(s.backtestWinRate)}%` : "—"}</td>
                  <td className={`p-2 text-right font-mono ${s.avgReturn != null && s.avgReturn >= 0 ? "text-bull" : s.avgReturn != null ? "text-bear" : ""}`}>{s.avgReturn != null ? `${Number(s.avgReturn).toFixed(2)}%` : "—"}</td>
                  <td className="p-2 text-right font-mono">{s.profitFactor != null ? Number(s.profitFactor).toFixed(2) : "—"}</td>
                  <td className="p-2 text-right font-mono">{s.maxDrawdown != null ? `${Number(s.maxDrawdown).toFixed(1)}%` : "—"}</td>
                </tr>
              ))}
              {(!perf.data || perf.data.length === 0) && (
                <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Belum ada data strategy intelligence. Jalankan backtest dengan label strategy + sector + regime.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
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

// ---------------- Autonomous Mode Controls ----------------
function AutonomousModeControls({ agent, onChange }: { agent: any; onChange: () => void }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const mode = (agent?.symbol_selection_mode ?? "manual") as "manual" | "autonomous";
  const universe = (agent?.autonomous_universe ?? "idx_liquid") as string;

  const setMode = useMutation({
    mutationFn: (vars: { mode: "manual" | "autonomous"; acknowledge?: boolean; autonomousUniverse?: string }) =>
      setSelectionMode({ data: { id: agent.id, mode: vars.mode, acknowledge: vars.acknowledge, autonomousUniverse: vars.autonomousUniverse as any } }),
    onSuccess: () => { toast.success("Mode updated"); onChange(); },
    onError: (e: any) => toast.error(e?.message ?? "Update failed"),
  });
  const setUniverse = useMutation({
    mutationFn: (u: string) => setSelectionMode({ data: { id: agent.id, mode: "autonomous", autonomousUniverse: u as any } }),
    onSuccess: () => { toast.success("Universe updated"); onChange(); },
    onError: (e: any) => toast.error(e?.message ?? "Update failed"),
  });

  if (!agent?.id) return null;

  const onToggle = (next: "manual" | "autonomous") => {
    if (next === mode) return;
    if (next === "autonomous" && !agent.autonomous_mode_acknowledged) {
      setConfirmOpen(true);
      return;
    }
    setMode.mutate({ mode: next });
  };

  return (
    <div className="rounded border border-border/60 p-3 space-y-2 bg-muted/20">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide">Symbol Selection Mode</div>
          <div className="text-[11px] text-muted-foreground">
            {mode === "manual"
              ? "Manual — Anda memilih emiten; AI hanya menganalisis daftar tsb."
              : "Autonomous — AI scan market, memilih emiten sendiri, dan eksekusi paper trade."}
          </div>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant={mode === "manual" ? "default" : "outline"} onClick={() => onToggle("manual")} disabled={setMode.isPending}>Manual</Button>
          <Button size="sm" variant={mode === "autonomous" ? "default" : "outline"} onClick={() => onToggle("autonomous")} disabled={setMode.isPending}>Autonomous AI</Button>
        </div>
      </div>

      {mode === "autonomous" && (
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-[11px] text-muted-foreground">Universe</label>
          <Select value={universe} onValueChange={(v) => setUniverse.mutate(v)}>
            <SelectTrigger className="h-7 w-[200px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="idx_liquid">IDX Liquid (LQ45)</SelectItem>
              <SelectItem value="bluechip">Bluechip</SelectItem>
              <SelectItem value="watchlist_plus">Watchlist + LQ45</SelectItem>
              <SelectItem value="custom_universe">Custom (selected_symbols)</SelectItem>
              <SelectItem value="all_supported">All Supported (IDX + US)</SelectItem>
              <SelectItem value="undervalued_candidates">💎 Undervalued Candidates</SelectItem>
              <SelectItem value="quality_undervalued">💎 Quality + Undervalued</SelectItem>
              <SelectItem value="dividend_undervalued">💰 Dividend + Undervalued</SelectItem>
              <SelectItem value="sector_discount">📉 Sector Discount</SelectItem>
              <SelectItem value="hybrid_trading_and_value">🎯 Hybrid Trading + Value</SelectItem>
            </SelectContent>
          </Select>
          <span className="text-[10px] text-muted-foreground">
            Max {agent.max_autonomous_symbols ?? 5} simbol · min score {agent.min_autonomous_score ?? 70}
          </span>
        </div>
      )}

      {confirmOpen && (
        <div className="rounded border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="size-4 text-amber-500 mt-0.5" />
            <div className="text-xs leading-relaxed">
              <div className="font-semibold mb-1">Aktifkan Autonomous Mode?</div>
              <p>AI akan scan market secara otomatis, memilih emiten sendiri, dan mengeksekusi <strong>paper trade</strong> tanpa konfirmasi manual.
              Semua transaksi tetap virtual — tidak ada real-money, tidak terhubung ke broker, dan tetap mengikuti risk management + market session guard.</p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setConfirmOpen(false)}>Batal</Button>
            <Button size="sm" onClick={() => { setConfirmOpen(false); setMode.mutate({ mode: "autonomous", acknowledge: true }); }}>
              Saya mengerti, aktifkan
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- Autonomous Scanner Panel ----------------
function AutonomousScannerPanel({ agent }: { agent: any }) {
  const latest = useQuery({
    queryKey: ["autoScan", agent?.id],
    queryFn: () => getLatestScan({ data: { agentId: agent.id } }),
    enabled: !!agent?.id,
    refetchInterval: 30_000,
  });
  const rescan = useMutation({
    mutationFn: () => runAutonomousScanNow({ data: { id: agent.id } }),
    onSuccess: () => { toast.success("Scan dijalankan"); latest.refetch(); },
    onError: (e: any) => toast.error(e?.message ?? "Scan gagal"),
  });
  const setMode = useMutation({
    mutationFn: (m: "conservative" | "balanced" | "progressive" | "expert_research") =>
      setAutonomousRiskMode({ data: { id: agent.id, riskMode: m, acknowledge: true } }),
    onSuccess: (r: any) => { toast.success(`Risk mode: ${r.riskMode}`); latest.refetch(); },
    onError: (e: any) => toast.error(e?.message ?? "Gagal ganti mode"),
  });
  const backfill = useMutation({
    mutationFn: () => backfillScanCandidateOutcomes({ data: { agentId: agent.id, limit: 50 } }),
    onSuccess: (r: any) => { toast.success(`Outcome backfill: ${r.updated}/${r.processed} updated`); latest.refetch(); },
    onError: (e: any) => toast.error(e?.message ?? "Backfill gagal"),
  });

  const scan = (latest.data as any)?.scan ?? null;
  const candidates = ((latest.data as any)?.candidates ?? []) as any[];
  const selected: string[] = (scan?.selected_symbols ?? []) as string[];
  const currentMode: string = agent?.autonomous_risk_mode ?? "balanced";

  // Summary counts by classification.
  const counts = candidates.reduce((acc: any, c: any) => {
    const k = c.candidate_classification ?? (c.passed_filters ? "trade_candidate" : "rejected");
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const tradeN = counts.trade_candidate ?? 0;
  const watchN = (counts.watch_candidate ?? 0) + (counts.premarket_watch ?? 0);
  const researchN = counts.research_candidate ?? 0;
  const rejectedN = (counts.rejected ?? 0) + (counts.risk_blocked ?? 0) + (counts.data_blocked ?? 0);

  const classLabel = (c: any): { label: string; cls: string; title: string } => {
    const k = c.candidate_classification ?? (c.passed_filters ? "trade_candidate" : "rejected");
    const elig = c.execution_eligibility ?? "";
    if (k === "trade_candidate") return { label: "trade", cls: "text-bull", title: "Lolos filter penuh. Kandidat eksekusi paper trade." };
    if (k === "watch_candidate") return { label: "watch", cls: "text-amber-500", title: "Tidak dieksekusi. Dipantau untuk outcome tracking." };
    if (k === "premarket_watch") return { label: "pre-market", cls: "text-amber-500", title: "Market belum buka — disimpan sebagai pre-market watchlist." };
    if (k === "research_candidate") return { label: "research", cls: "text-blue-400", title: "Skor rendah — disimpan untuk pembelajaran (Progressive/Expert)." };
    if (k === "risk_blocked") return { label: "risk-blocked", cls: "text-muted-foreground", title: c.blocked_reason ?? c.rejection_reason ?? "Risk filter menolak." };
    if (k === "data_blocked") return { label: "data-blocked", cls: "text-muted-foreground", title: c.blocked_reason ?? "Data quality kurang." };
    return { label: "rejected", cls: "text-muted-foreground", title: c.rejection_reason ?? elig ?? "" };
  };

  const modes: Array<{ k: "conservative" | "balanced" | "progressive" | "expert_research"; label: string; hint: string }> = [
    { k: "conservative", label: "Conservative", hint: "Hanya trade candidate skor tinggi." },
    { k: "balanced", label: "Balanced", hint: "Trade + watch outcome tracking." },
    { k: "progressive", label: "Progressive", hint: "Tambahkan small-lot exploration." },
    { k: "expert_research", label: "Expert Research", hint: "Eksplorasi luas untuk training data." },
  ];

  return (
    <div className="rounded border border-border/60 p-3 space-y-2 bg-muted/10">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide">Autonomous Scanner</div>
          <div className="text-[11px] text-muted-foreground">
            Universe <span className="font-mono">{scan?.universe ?? agent?.autonomous_universe ?? "idx_liquid"}</span>
            {scan ? <> · {scan.symbols_scanned_count} scanned · {scan.valid_candidates_count} valid · last {fmtWIBTime(scan.scan_time)}</> : " · belum pernah scan"}
          </div>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => backfill.mutate()} disabled={backfill.isPending} title="Hitung hypothetical return untuk watch/research candidates">
            {backfill.isPending ? "Backfill…" : "Backfill outcomes"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => rescan.mutate()} disabled={rescan.isPending}>
            {rescan.isPending ? "Scanning…" : "Rescan now"}
          </Button>
        </div>
      </div>

      {/* Risk mode selector */}
      <div>
        <div className="text-[11px] text-muted-foreground mb-1">Risk mode</div>
        <div className="flex flex-wrap gap-1">
          {modes.map(m => (
            <Button
              key={m.k}
              size="sm"
              variant={currentMode === m.k ? "default" : "outline"}
              onClick={() => setMode.mutate(m.k)}
              disabled={setMode.isPending}
              title={m.hint}
              className="h-7 text-[11px]"
            >
              {m.label}
            </Button>
          ))}
        </div>
        <div className="text-[10px] text-muted-foreground mt-1">
          {modes.find(m => m.k === currentMode)?.hint} Semua eksekusi tetap Paper Trading.
        </div>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-1 text-[11px]">
        <span className="px-2 py-0.5 rounded bg-bull/15 text-bull">Trade {tradeN}</span>
        <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-500">Watch {watchN}</span>
        <span className="px-2 py-0.5 rounded bg-blue-500/15 text-blue-400">Research {researchN}</span>
        <span className="px-2 py-0.5 rounded bg-muted/40 text-muted-foreground">Rejected {rejectedN}</span>
      </div>

      <div>
        <div className="text-[11px] text-muted-foreground mb-1">Selected for execution (top {selected.length})</div>
        <div className="flex flex-wrap gap-1 min-h-6">
          {selected.length === 0 && <span className="text-xs text-muted-foreground">Tidak ada trade candidate — lihat tabel untuk alasan.</span>}
          {selected.map((s, i) => (
            <span key={s} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-primary/15 text-primary text-xs font-mono">
              #{i + 1} {s}
            </span>
          ))}
        </div>
      </div>

      {candidates.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] min-w-[560px]">
            <thead className="text-muted-foreground">
              <tr>
                <th className="text-left p-1">#</th>
                <th className="text-left p-1">Symbol</th>
                <th className="text-right p-1">Score</th>
                <th className="text-right p-1">Tech</th>
                <th className="text-right p-1">Liq</th>
                <th className="text-right p-1">Risk</th>
                <th className="text-left p-1">Status</th>
                <th className="text-right p-1" title="Hypothetical return jika di-entry pada scan price">Hypo 1h</th>
              </tr>
            </thead>
            <tbody>
              {candidates.slice(0, 15).map((c: any) => {
                const cl = classLabel(c);
                const hypo = c.hypothetical_return_1h;
                return (
                  <tr key={c.id} className="border-t border-border/40">
                    <td className="p-1 font-mono">{c.rank ?? "—"}</td>
                    <td className="p-1 font-mono">{c.symbol}</td>
                    <td className="p-1 text-right font-mono">{Number(c.autonomous_score ?? 0).toFixed(0)}</td>
                    <td className="p-1 text-right font-mono">{Number(c.technical_score ?? 0).toFixed(0)}</td>
                    <td className="p-1 text-right font-mono">{Number(c.liquidity_score ?? 0).toFixed(0)}</td>
                    <td className="p-1 text-right font-mono">{Number(c.risk_score ?? 0).toFixed(0)}</td>
                    <td className="p-1">
                      <span className={cl.cls} title={cl.title}>{cl.label}</span>
                    </td>
                    <td className="p-1 text-right font-mono">
                      {hypo == null ? <span className="text-muted-foreground">—</span> :
                        <span className={Number(hypo) >= 0 ? "text-bull" : "text-bear"}>{Number(hypo).toFixed(2)}%</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {scan?.reasoning && (
        <div className="text-[10px] text-muted-foreground italic">{scan.reasoning}</div>
      )}
    </div>
  );
}


