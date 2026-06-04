import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Returns Swing Max UI snapshot: agent config flag + recent open swing plans.
export const getSwingMaxStatus = createServerFn({ method: "GET" }).handler(async () => {
  const USER_ID = "00000000-0000-0000-0000-000000000001";
  const { data: agent } = await supabaseAdmin
    .from("ai_trade_agents")
    .select("id, swing_mode_active, swing_quality_threshold, target_holding_days, max_holding_days, max_trades_per_symbol_per_week, swing_protection_active, swing_protection_reason, swing_protection_until")
    .eq("user_id", USER_ID).maybeSingle();

  if (!agent) return { agent: null, plans: [], stats: null };

  const { data: plans } = await supabaseAdmin
    .from("swing_trade_plans")
    .select("symbol, entry_type, entry_price, stop_loss, take_profit_1, take_profit_2, risk_reward_ratio, swing_quality_score, status, target_holding_days, max_holding_days, min_holding_until, time_stop_at, trailing_active, trailing_stop, created_at, closed_at, exit_reason, realized_pnl, realized_pnl_pct")
    .eq("agent_id", agent.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const open = (plans ?? []).filter(p => !p.closed_at);
  const closed = (plans ?? []).filter(p => p.closed_at);
  const wins = closed.filter(p => Number(p.realized_pnl ?? 0) > 0).length;
  const stats = {
    openCount: open.length,
    closedCount: closed.length,
    winRate: closed.length ? wins / closed.length : 0,
    avgHoldDays: closed.length
      ? closed.reduce((s, p) => s + ((new Date(p.closed_at!).getTime() - new Date(p.created_at).getTime()) / 86400_000), 0) / closed.length
      : 0,
  };
  return { agent, plans: plans ?? [], stats };
});
