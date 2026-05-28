/**
 * Position Management — server-side wiring for Update 14 Phase 2.
 *
 * Bridges the pure engine in position-management-engine.ts with DB state:
 *   - `upsertExitPlanAfterBuy` creates/updates a row in `position_exit_plans`
 *     right after a paper BUY fills, so every open position has a tracked plan.
 *   - `evaluatePositionWithEngine` runs the full stop/TP/trailing/hold-exit
 *     scoring against the latest quote, persists a `position_monitoring_snapshots`
 *     row for the decision replay UI, and updates the plan with the new
 *     trailing-stop / high-water-mark, returning a combined signal so the
 *     caller can act on it (e.g. trigger a paper SELL).
 *
 * Paper trading only. SELL/EXIT signals emitted here MUST NOT be gated by
 * buy-side risk pauses — the caller is responsible for honoring that.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  buildExitPlan,
  calculateHoldExitScore,
  combineExitSignals,
  evaluateStopLoss,
  evaluateTakeProfit,
  evaluateTrailingStop,
  type ExitPlanInput,
  type MarketContext,
  type PositionSnapshot,
  type RiskMode,
} from "./position-management-engine";

const RISK_MODES = new Set<RiskMode>(["conservative", "balanced", "progressive", "expert"]);
function normalizeRiskMode(mode: unknown): RiskMode {
  return RISK_MODES.has(mode as RiskMode) ? (mode as RiskMode) : "balanced";
}

export interface UpsertExitPlanInput {
  agentId: string;
  accountId: string;
  positionId?: string | null;
  symbol: string;
  entryPrice: number;
  quantity: number;
  atr?: number | null;
  riskMode?: RiskMode | string | null;
  strategyName?: string | null;
  confidence?: number | null;
}

export async function upsertExitPlanAfterBuy(input: UpsertExitPlanInput) {
  const mode = normalizeRiskMode(input.riskMode);
  const built = buildExitPlan({
    entryPrice: input.entryPrice,
    atr: input.atr ?? undefined,
    riskMode: mode,
  });

  // Load existing plan for this account+symbol so we don't accumulate stale rows.
  const { data: existing } = await supabaseAdmin
    .from("position_exit_plans")
    .select("id, highest_price_since_entry")
    .eq("account_id", input.accountId)
    .eq("symbol", input.symbol)
    .maybeSingle();

  const row = {
    account_id: input.accountId,
    agent_id: input.agentId,
    position_id: input.positionId ?? null,
    symbol: input.symbol,
    avg_entry: input.entryPrice,
    entry_price: input.entryPrice,
    quantity: input.quantity,
    current_price: input.entryPrice,
    highest_price_since_entry: Math.max(
      Number(existing?.highest_price_since_entry ?? 0),
      input.entryPrice,
    ),
    stop_loss: built.stopLoss,
    take_profit: built.takeProfit,
    trailing_stop: null as number | null,
    trailing_stop_pct: built.trailingStopPct,
    risk_reward_ratio: built.riskRewardRatio,
    management_status: "HOLDING",
    strategy_name: input.strategyName ?? null,
    confidence: Number.isFinite(input.confidence as number) ? Number(input.confidence) : 0,
    reason: built.reason,
    warnings: built.warnings,
    last_evaluated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    await supabaseAdmin.from("position_exit_plans").update(row).eq("id", existing.id);
    return { ok: true, planId: existing.id, plan: built };
  }
  const { data } = await supabaseAdmin
    .from("position_exit_plans")
    .insert(row)
    .select("id")
    .maybeSingle();
  return { ok: true, planId: data?.id ?? null, plan: built };
}

export interface EvaluatePositionInput {
  agentId: string;
  accountId: string;
  positionId?: string | null;
  symbol: string;
  quantity: number;
  avgEntry: number;
  currentPrice: number;
  riskMode?: RiskMode | string | null;
  marketContext?: MarketContext;
  marketSession?: string | null;
  strategyEdgeScore?: number;
  riskEnginePaused?: boolean;
}

/**
 * Run the full engine against an open position, persist snapshot + updated plan,
 * and return the combined signal. Returns `null` if no plan exists and one
 * could not be created (defensive — caller should ensure upsert happened on BUY).
 */
export async function evaluatePositionWithEngine(input: EvaluatePositionInput) {
  const mode = normalizeRiskMode(input.riskMode);

  // Load existing plan (created by upsertExitPlanAfterBuy on BUY fill).
  let { data: planRow } = await supabaseAdmin
    .from("position_exit_plans")
    .select("*")
    .eq("account_id", input.accountId)
    .eq("symbol", input.symbol)
    .maybeSingle();

  // Defensive: if no plan, synthesize one from current state so monitoring
  // doesn't silently no-op for positions opened before this patch shipped.
  if (!planRow) {
    const built = buildExitPlan({ entryPrice: input.avgEntry, riskMode: mode });
    const { data: created } = await supabaseAdmin
      .from("position_exit_plans")
      .insert({
        account_id: input.accountId,
        agent_id: input.agentId,
        position_id: input.positionId ?? null,
        symbol: input.symbol,
        avg_entry: input.avgEntry,
        entry_price: input.avgEntry,
        quantity: input.quantity,
        current_price: input.currentPrice,
        highest_price_since_entry: Math.max(input.avgEntry, input.currentPrice),
        stop_loss: built.stopLoss,
        take_profit: built.takeProfit,
        trailing_stop_pct: built.trailingStopPct,
        risk_reward_ratio: built.riskRewardRatio,
        management_status: "HOLDING",
        reason: `backfill_plan:${built.reason}`,
        warnings: ["plan_backfilled_during_monitoring"],
        last_evaluated_at: new Date().toISOString(),
      })
      .select("*")
      .maybeSingle();
    planRow = created ?? null;
  }
  if (!planRow) return null;

  const pos: PositionSnapshot = {
    symbol: input.symbol,
    quantity: input.quantity,
    avgEntry: input.avgEntry,
    currentPrice: input.currentPrice,
    highestPriceSinceEntry: Number(planRow.highest_price_since_entry ?? input.avgEntry),
  };
  const plan: ExitPlanInput = {
    stopLoss: planRow.stop_loss != null ? Number(planRow.stop_loss) : null,
    takeProfit: planRow.take_profit != null ? Number(planRow.take_profit) : null,
    trailingStop: planRow.trailing_stop != null ? Number(planRow.trailing_stop) : null,
    trailingStopPct: planRow.trailing_stop_pct != null ? Number(planRow.trailing_stop_pct) : null,
    highestPriceSinceEntry: Number(planRow.highest_price_since_entry ?? input.avgEntry),
  };
  const market = input.marketContext ?? {};

  const stop = evaluateStopLoss(pos, plan, market);
  const takeProfit = evaluateTakeProfit(pos, plan, market);
  const trailing = evaluateTrailingStop(pos, plan, { riskMode: mode });
  const holdExit = calculateHoldExitScore({
    position: pos,
    plan,
    market,
    strategyEdgeScore: input.strategyEdgeScore,
    riskEnginePaused: input.riskEnginePaused,
  });
  const combined = combineExitSignals({ stop, takeProfit, trailing, holdExit });

  const unrealizedPnl = (input.currentPrice - input.avgEntry) * input.quantity;
  const unrealizedPnlPct =
    input.avgEntry > 0 ? ((input.currentPrice - input.avgEntry) / input.avgEntry) * 100 : 0;

  // Persist monitoring snapshot for decision replay / UI.
  await supabaseAdmin.from("position_monitoring_snapshots").insert({
    account_id: input.accountId,
    agent_id: input.agentId,
    position_id: input.positionId ?? null,
    symbol: input.symbol,
    current_price: input.currentPrice,
    hold_score: holdExit.holdScore,
    exit_score: holdExit.exitScore,
    reduce_score: holdExit.reduceScore,
    action: holdExit.action,
    management_status: combined.managementStatus,
    market_session: input.marketSession ?? null,
    unrealized_pnl: unrealizedPnl,
    unrealized_pnl_pct: unrealizedPnlPct,
    reasons: combined.reasons as unknown as never,
    warnings: combined.warnings as unknown as never,
  });

  // Update plan with latest evaluation state (trailing stop ratchets up).
  await supabaseAdmin
    .from("position_exit_plans")
    .update({
      current_price: input.currentPrice,
      highest_price_since_entry: trailing.newHighestPrice,
      trailing_stop: trailing.newTrailingStop,
      management_status: combined.managementStatus,
      last_evaluated_at: new Date().toISOString(),
      warnings: combined.warnings,
    })
    .eq("id", planRow.id);

  return { combined, holdExit, stop, takeProfit, trailing, plan: planRow };
}
