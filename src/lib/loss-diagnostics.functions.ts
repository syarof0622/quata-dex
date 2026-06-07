// Loss-protection diagnostics for the UI ("Why the AI is losing").
// Reads diagnostic_summary persisted by recordTradeOutcome / refreshAgentDiagnostic,
// plus live cooldowns and paused strategies.
import { createServerFn } from "@tanstack/react-start";
import { currentUserId } from "@/lib/current-user.server";

export const getLossDiagnostics = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { refreshAgentDiagnostic } = await import("./loss-protection.server");

  const { data: agent } = await supabaseAdmin
    .from("ai_trade_agents").select("*")
    .eq("user_id", currentUserId())
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!agent) return { agent: null, summary: null, cooldowns: [], pausedStrategies: [] };

  // Refresh on read so the panel reflects the latest sells.
  let summary: any = (agent as any).diagnostic_summary ?? null;
  try { summary = await refreshAgentDiagnostic((agent as any).id) ?? summary; } catch {}

  const nowIso = new Date().toISOString();
  const { data: cdRows } = await supabaseAdmin
    .from("symbol_trade_cooldowns")
    .select("symbol, reason, loss_count, cooldown_until, last_loss_at")
    .eq("agent_id", (agent as any).id)
    .gt("cooldown_until", nowIso)
    .order("cooldown_until", { ascending: true });
  const { data: shRows } = await supabaseAdmin
    .from("strategy_health")
    .select("strategy, status, trades, wins, losses, consec_losses, profit_factor, avg_return, paused_reason")
    .eq("agent_id", (agent as any).id)
    .order("profit_factor", { ascending: true });

  return {
    agent: {
      id: (agent as any).id,
      mode: (agent as any).diagnostic_status ?? "NORMAL",
      protectionActive: !!(agent as any).protection_mode_active,
      protectionReason: (agent as any).protection_mode_reason ?? null,
      consecutiveLosses: Number((agent as any).consecutive_losses ?? 0),
      maxConsecutiveLosses: Number((agent as any).max_consecutive_losses ?? 3),
      maxDailyLossPct: Number((agent as any).max_daily_loss_pct ?? 0.01),
      minTradeQualityScore: Number((agent as any).min_trade_quality_score ?? 75),
      minRiskReward: Number((agent as any).min_risk_reward ?? 2.0),
      minHoldMinutes: Number((agent as any).min_hold_minutes ?? 30),
    },
    summary,
    cooldowns: cdRows ?? [],
    pausedStrategies: (shRows ?? []).filter((s: any) => s.status === "PAUSED_FOR_REVIEW"),
    strategyHealth: shRows ?? [],
  };
});
