import { createServerFn } from "@tanstack/react-start";
import { currentUserId } from "@/lib/current-user.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Returns Swing Max UI snapshot: agent config flag, recent open swing plans,
// and the most recent High-Conviction allocation decisions (accepted +
// rejected) so the UI can show WHY allocation is big/small/zero.
export const getSwingMaxStatus = createServerFn({ method: "GET" }).handler(async () => {
  const { data: agent } = await supabaseAdmin
    .from("ai_trade_agents")
    .select("id, swing_mode_active, swing_quality_threshold, target_holding_days, max_holding_days, max_trades_per_symbol_per_week, swing_protection_active, swing_protection_reason, swing_protection_until, consecutive_losses, diagnostic_status, protection_mode_active")
    .eq("user_id", currentUserId()).maybeSingle();

  if (!agent) return { agent: null, plans: [], stats: null, allocationDecisions: [] };

  const { data: plans } = await supabaseAdmin
    .from("swing_trade_plans")
    .select("symbol, entry_type, entry_price, stop_loss, take_profit_1, take_profit_2, risk_reward_ratio, swing_quality_score, status, target_holding_days, max_holding_days, min_holding_until, time_stop_at, trailing_active, trailing_stop, created_at, closed_at, exit_reason, realized_pnl, realized_pnl_pct")
    .eq("agent_id", agent.id)
    .order("created_at", { ascending: false })
    .limit(20);

  // Recent decisions (BUY accepted + blocked) — surface allocation tier reasoning.
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data: decisions } = await supabaseAdmin
    .from("ai_agent_decisions")
    .select("symbol, action, decision_status, allocation_amount, suggested_lot, risk_reward_ratio, strategy, reasoning, risk_snapshot, created_at")
    .eq("agent_id", agent.id)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(30);

  const allocationDecisions = (decisions ?? [])
    .map((d: any) => {
      const swing = (d.risk_snapshot as any)?.swingPlan ?? null;
      const swQ = (d.risk_snapshot as any)?.swingQuality ?? null;
      // include swing-related decisions only
      const isSwing = swing || (d.strategy === "swing_max") || String(d.reasoning ?? "").includes("Swing Max") || String(d.reasoning ?? "").includes("SwingMax");
      if (!isSwing) return null;
      return {
        symbol: d.symbol,
        action: d.action,
        status: d.decision_status,
        createdAt: d.created_at,
        allocationIDR: Number(d.allocation_amount ?? 0),
        lot: Number(d.suggested_lot ?? 0),
        rr: Number(d.risk_reward_ratio ?? 0),
        tier: swing?.allocationTier ?? null,
        tierLabel: swing?.allocationTierLabel ?? null,
        allocationPct: swing?.allocationPct ?? null,
        capWinner: swing?.allocationCapWinner ?? null,
        allocationReason: swing?.allocationReason ?? null,
        qualityScore: swing?.swingQualityScore ?? swQ?.score ?? null,
        riskPerTradePct: swing?.riskPerTradePct ?? null,
        reasoningShort: String(d.reasoning ?? "").slice(0, 240),
      };
    })
    .filter(Boolean)
    .slice(0, 12);

  const open = (plans ?? []).filter((p: any) => !p.closed_at);
  const closed = (plans ?? []).filter((p: any) => p.closed_at);
  const wins = closed.filter((p: any) => Number(p.realized_pnl ?? 0) > 0).length;
  const stats = {
    openCount: open.length,
    closedCount: closed.length,
    winRate: closed.length ? wins / closed.length : 0,
    avgHoldDays: closed.length
      ? closed.reduce((s: number, p: any) => s + ((new Date(p.closed_at!).getTime() - new Date(p.created_at).getTime()) / 86400_000), 0) / closed.length
      : 0,
  };
  return { agent, plans: plans ?? [], stats, allocationDecisions };
});
