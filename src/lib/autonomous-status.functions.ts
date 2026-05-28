// Aggregates worker heartbeat, exit plans, recent decisions, and
// "Why AI Did Not Trade" diagnostics for the AI Trade Agent UI panels.
// Read-only — no side effects. Paper trading only.
import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getIDXMarketSession } from "@/lib/idx-market-session";

const USER_ID = "00000000-0000-0000-0000-000000000001";

export type WorkerLifecycle =
  | "auto_running"
  | "auto_idle_market_closed"
  | "auto_stale"
  | "auto_error"
  | "auto_unauthorized"
  | "manual_only"
  | "not_configured";

function classifyWorker(opts: {
  automationEnabled: boolean;
  lastRunAt: string | null;
  status: string | null;
  marketOpen: boolean;
}): { lifecycle: WorkerLifecycle; label: string; tone: "emerald" | "amber" | "rose" | "slate" | "sky" } {
  if (!opts.automationEnabled) return { lifecycle: "manual_only", label: "Manual Only", tone: "slate" };
  const last = opts.lastRunAt ? Date.parse(opts.lastRunAt) : 0;
  const ageSec = last ? Math.round((Date.now() - last) / 1000) : Number.POSITIVE_INFINITY;
  const fresh = ageSec <= 180; // 3-min grace for a 1-min cron
  if (!last) return { lifecycle: "not_configured", label: "Not Configured", tone: "rose" };
  if (opts.status === "unauthorized")
    return { lifecycle: "auto_unauthorized", label: "Unauthorized (bad CRON_SECRET)", tone: "rose" };
  if (opts.status === "error" && fresh)
    return { lifecycle: "auto_error", label: "Worker Error", tone: "rose" };
  if (!fresh) return { lifecycle: "auto_stale", label: "Auto Stale", tone: "amber" };
  if (!opts.marketOpen)
    return { lifecycle: "auto_idle_market_closed", label: "Auto Idle — Market Closed", tone: "sky" };
  return { lifecycle: "auto_running", label: "Auto Running", tone: "emerald" };
}

export const getAutonomousAgentStatus = createServerFn({ method: "GET" }).handler(async () => {
  const session = getIDXMarketSession();

  // Active agent (highest priority — primary autonomous one).
  const { data: agent } = await supabaseAdmin
    .from("ai_trade_agents")
    .select(
      "id, name, status, trading_enabled, automation_enabled, risk_level, autonomous_risk_mode, last_worker_run_at, last_worker_status, last_worker_message, next_expected_worker_run_at, worker_error_count, last_blocked_reason, last_auto_decision_at, last_auto_execution_at",
    )
    .eq("user_id", USER_ID)
    .eq("trading_enabled", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const automationEnabled = !!(agent && (agent as any).automation_enabled !== false);
  const worker = classifyWorker({
    automationEnabled,
    lastRunAt: (agent as any)?.last_worker_run_at ?? null,
    status: (agent as any)?.last_worker_status ?? null,
    marketOpen: session.isOpen,
  });

  // Active account + open positions (joined with exit plans).
  const { data: account } = await supabaseAdmin
    .from("paper_accounts")
    .select("id, cash, equity, currency")
    .eq("user_id", USER_ID)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const [{ data: positions }, { data: plans }] = await Promise.all([
    supabaseAdmin
      .from("paper_positions")
      .select("id, symbol, qty, avg_price, opened_at")
      .eq("user_id", USER_ID),
    supabaseAdmin
      .from("position_exit_plans")
      .select(
        "id, symbol, account_id, avg_entry, current_price, quantity, stop_loss, take_profit, trailing_stop, trailing_stop_pct, risk_reward_ratio, management_status, reason, warnings, last_evaluated_at, highest_price_since_entry",
      )
      .eq("account_id", account?.id ?? "00000000-0000-0000-0000-000000000000"),
  ]);

  const planBySymbol = new Map<string, any>();
  for (const p of plans ?? []) planBySymbol.set((p as any).symbol, p);

  const openPositions = (positions ?? []).map((p: any) => {
    const plan = planBySymbol.get(p.symbol);
    const last = Number(plan?.current_price ?? p.avg_price);
    const avg = Number(p.avg_price);
    const qty = Number(p.qty);
    const pnl = (last - avg) * qty;
    const pnlPct = avg > 0 ? ((last - avg) / avg) * 100 : 0;
    const sl = plan?.stop_loss != null ? Number(plan.stop_loss) : null;
    const tp = plan?.take_profit != null ? Number(plan.take_profit) : null;
    const trailing = plan?.trailing_stop != null ? Number(plan.trailing_stop) : null;
    const distToSL = sl != null && last > 0 ? ((last - sl) / last) * 100 : null;
    const distToTP = tp != null && last > 0 ? ((tp - last) / last) * 100 : null;
    return {
      symbol: p.symbol,
      qty,
      avgEntry: avg,
      lastPrice: last,
      unrealizedPnl: pnl,
      unrealizedPnlPct: pnlPct,
      stopLoss: sl,
      takeProfit: tp,
      trailingStop: trailing,
      trailingStopPct: plan?.trailing_stop_pct ?? null,
      managementStatus: (plan?.management_status ?? "NO_PLAN") as string,
      reason: plan?.reason ?? null,
      warnings: (plan?.warnings as string[] | null) ?? [],
      lastEvaluatedAt: plan?.last_evaluated_at ?? null,
      distanceToStopPct: distToSL,
      distanceToTakeProfitPct: distToTP,
      riskRewardRatio: plan?.risk_reward_ratio ?? null,
      hasPlan: !!plan,
    };
  });

  // Summary counts.
  const summary = {
    monitored: openPositions.length,
    withPlan: openPositions.filter((p) => p.hasPlan).length,
    nearStopLoss: openPositions.filter(
      (p) => p.distanceToStopPct != null && p.distanceToStopPct <= 2 && p.distanceToStopPct >= -1,
    ).length,
    nearTakeProfit: openPositions.filter(
      (p) => p.distanceToTakeProfitPct != null && p.distanceToTakeProfitPct <= 2 && p.distanceToTakeProfitPct >= -1,
    ).length,
    trailingActive: openPositions.filter((p) => p.managementStatus === "TRAILING_STOP_ACTIVE").length,
    exitPending: openPositions.filter((p) => /EXIT|TRIGGER/i.test(p.managementStatus)).length,
    withoutPlan: openPositions.filter((p) => !p.hasPlan).length,
  };

  // Recent decisions (last 24h).
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: decisions } = await supabaseAdmin
    .from("ai_agent_decisions")
    .select(
      "id, created_at, symbol, action, decision_status, confidence, stop_loss, take_profit, risk_reward_ratio, reasoning, selection_reason",
    )
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(50);

  const blocked = (decisions ?? []).filter(
    (d: any) => d.decision_status === "blocked" || d.action === "BLOCKED" || d.action === "NO_TRADE",
  );
  const executed = (decisions ?? []).filter(
    (d: any) => d.decision_status === "executed" || d.action === "BUY" || d.action === "SELL",
  );
  const reasonCounts = new Map<string, number>();
  for (const d of blocked) {
    const r = (d as any).selection_reason || (d as any).reasoning || "unknown";
    const key = String(r).slice(0, 80);
    reasonCounts.set(key, (reasonCounts.get(key) ?? 0) + 1);
  }
  const topBlockedReasons = [...reasonCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([reason, count]) => ({ reason, count }));

  // Build "Why AI Did Not Trade" diagnostic.
  const cash = Number(account?.cash ?? 0);
  const equity = Number(account?.equity ?? cash);
  const diagnostic: { key: string; label: string; value: string; ok: boolean }[] = [
    { key: "session", label: "Market session", value: session.state, ok: session.isOpen },
    {
      key: "worker",
      label: "Worker status",
      value: worker.label,
      ok: worker.lifecycle === "auto_running" || worker.lifecycle === "auto_idle_market_closed",
    },
    { key: "automation", label: "Automation enabled", value: automationEnabled ? "Yes" : "No", ok: automationEnabled },
    { key: "cash", label: "Cash available", value: cash > 0 ? cash.toLocaleString() : "0", ok: cash > 0 },
    {
      key: "positions",
      label: "Open positions",
      value: `${openPositions.length}`,
      ok: true,
    },
    {
      key: "decisions24h",
      label: "Decisions (24h)",
      value: `${decisions?.length ?? 0} (exec ${executed.length} / blocked ${blocked.length})`,
      ok: (decisions?.length ?? 0) > 0,
    },
    {
      key: "lastBlocked",
      label: "Last blocked reason",
      value: (agent as any)?.last_blocked_reason ?? blocked[0]?.selection_reason ?? "—",
      ok: true,
    },
  ];

  return {
    nowIso: new Date().toISOString(),
    session: { state: session.state, isOpen: session.isOpen, isBreak: session.isBreak },
    agent: agent
      ? {
          id: (agent as any).id,
          name: (agent as any).name,
          status: (agent as any).status,
          automationEnabled,
          riskMode: (agent as any).autonomous_risk_mode ?? (agent as any).risk_level ?? "balanced",
          worker,
          heartbeat: {
            lastRunAt: (agent as any).last_worker_run_at,
            lastStatus: (agent as any).last_worker_status,
            lastMessage: (agent as any).last_worker_message,
            nextExpectedAt: (agent as any).next_expected_worker_run_at,
            errorCount: (agent as any).worker_error_count ?? 0,
            lastBlockedReason: (agent as any).last_blocked_reason,
            lastAutoDecisionAt: (agent as any).last_auto_decision_at,
            lastAutoExecutionAt: (agent as any).last_auto_execution_at,
          },
        }
      : null,
    account: account
      ? { id: (account as any).id, cash, equity, currency: (account as any).currency ?? "IDR" }
      : null,
    summary,
    positions: openPositions,
    decisions: {
      total24h: decisions?.length ?? 0,
      executed24h: executed.length,
      blocked24h: blocked.length,
      topBlockedReasons,
      latest: (decisions ?? []).slice(0, 10).map((d: any) => ({
        id: d.id,
        createdAt: d.created_at,
        symbol: d.symbol,
        action: d.action,
        status: d.decision_status,
        confidence: d.confidence,
        stopLoss: d.stop_loss,
        takeProfit: d.take_profit,
        riskRewardRatio: d.risk_reward_ratio,
        reason: d.selection_reason ?? d.reasoning,
      })),
    },
    diagnostic,
  };
});
