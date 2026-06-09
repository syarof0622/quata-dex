/**
 * Trade outcome labeler. Server-only helper.
 * Pure functions — no DB access.
 */

export type OutcomeInput = {
  entryPrice: number;
  exitPrice: number;
  plannedStopLoss?: number | null;
  plannedTakeProfit1?: number | null;
  plannedTakeProfit2?: number | null;
  holdingDays?: number | null;
  maxFavorablePct?: number | null;
  maxAdversePct?: number | null;
  riskRewardRatio?: number | null;
  exitReason?: string | null;
};

export type OutcomeResult = {
  outcomeLabel: string;
  setupLabel: string;
  mistakeLabel: string;
  resultQuality: string;
  realizedReturnPct: number;
  realizedRMultiple: number | null;
};

export function labelOutcome(input: OutcomeInput, setupHint?: string | null): OutcomeResult {
  const entry = Number(input.entryPrice);
  const exit = Number(input.exitPrice);
  const sl = input.plannedStopLoss ? Number(input.plannedStopLoss) : null;
  const tp1 = input.plannedTakeProfit1 ? Number(input.plannedTakeProfit1) : null;
  const tp2 = input.plannedTakeProfit2 ? Number(input.plannedTakeProfit2) : null;
  const returnPct = entry > 0 ? ((exit - entry) / entry) * 100 : 0;
  const rMultiple = sl && entry > sl ? (exit - entry) / (entry - sl) : null;

  // Outcome label
  let outcomeLabel = "manual_exit";
  if (input.exitReason === "stop_loss") outcomeLabel = "stop_loss_hit";
  else if (input.exitReason === "take_profit") outcomeLabel = "take_profit_1_hit";
  else if (input.exitReason === "time_stop") outcomeLabel = "time_stop";
  else if (sl && exit <= sl) outcomeLabel = "stop_loss_hit";
  else if (tp2 && exit >= tp2) outcomeLabel = "take_profit_2_hit";
  else if (tp1 && exit >= tp1) outcomeLabel = "take_profit_1_hit";
  else if (Math.abs(returnPct) < 0.5) outcomeLabel = "breakeven";
  else if (returnPct > 0) outcomeLabel = "win";
  else outcomeLabel = "loss";

  // Setup label (from hint or fallback)
  const setupLabel = setupHint || "technical_only";

  // Mistake label
  let mistakeLabel = "no_mistake_detected";
  const mae = Number(input.maxAdversePct ?? 0);
  const mfe = Number(input.maxFavorablePct ?? 0);
  const rr = Number(input.riskRewardRatio ?? 0);
  if (outcomeLabel === "stop_loss_hit" && mae > 0 && mae < 1) {
    mistakeLabel = "stop_too_tight";
  } else if (outcomeLabel === "win" && tp1 && exit < tp1 && mfe > Math.abs(returnPct) * 1.5) {
    mistakeLabel = "early_exit";
  } else if (rr > 0 && rr < 1.5 && outcomeLabel === "loss") {
    mistakeLabel = "bad_risk_reward";
  } else if (outcomeLabel === "loss" && (input.holdingDays ?? 0) < 0.5) {
    mistakeLabel = "weak_momentum";
  }

  // Result quality
  let resultQuality = "neutral";
  const validRR = rr >= 1.5;
  if (outcomeLabel.includes("take_profit") || outcomeLabel === "win") {
    resultQuality = validRR ? "good_win" : "lucky_win";
  } else if (outcomeLabel === "stop_loss_hit" || outcomeLabel === "loss") {
    resultQuality = validRR && mistakeLabel === "no_mistake_detected" ? "good_loss" : "bad_loss";
  }

  return {
    outcomeLabel,
    setupLabel,
    mistakeLabel,
    resultQuality,
    realizedReturnPct: Number(returnPct.toFixed(3)),
    realizedRMultiple: rMultiple === null ? null : Number(rMultiple.toFixed(3)),
  };
}
