/**
 * Position Management Engine (Update 14)
 *
 * Pure functions for AI Trade Agent exit / hold / trailing logic.
 * No DB or network access here — callers (worker, paper engine, server fns)
 * pass in snapshots and persist the results.
 *
 * Paper trading only. SELL/EXIT decisions emitted here MUST NOT be blocked
 * by buy-side risk pauses; that contract is enforced by the caller.
 */

export type ManagementStatus =
  | "HOLDING"
  | "MONITOR"
  | "MONITOR_RISK"
  | "NEAR_STOP_LOSS"
  | "STOP_LOSS_TRIGGERED"
  | "NEAR_TAKE_PROFIT"
  | "TAKE_PROFIT_TRIGGERED"
  | "TRAILING_STOP_ACTIVE"
  | "TRAILING_STOP_TRIGGERED"
  | "REDUCE_SUGGESTED"
  | "EXIT_SUGGESTED"
  | "EXIT_EXECUTED"
  | "REVIEW_PENDING";

export type ExitReason =
  | "stop_loss_triggered"
  | "take_profit_triggered"
  | "trailing_stop_triggered"
  | "risk_exit"
  | "disclosure_exit"
  | "manual";

export type HoldExitAction =
  | "HOLD"
  | "MONITOR"
  | "MONITOR_RISK"
  | "REDUCE"
  | "EXIT"
  | "TAKE_PROFIT";

export type RiskMode = "conservative" | "balanced" | "progressive" | "expert";

export interface PositionSnapshot {
  symbol: string;
  quantity: number;
  avgEntry: number;
  currentPrice: number;
  highestPriceSinceEntry?: number | null;
  entryAtr?: number | null;
  sector?: string | null;
}

export interface ExitPlanInput {
  stopLoss?: number | null;
  takeProfit?: number | null;
  trailingStop?: number | null;
  trailingStopPct?: number | null;
  trailingActivated?: boolean;
  highestPriceSinceEntry?: number | null;
}

export interface MarketContext {
  regime?: "bullish" | "neutral" | "bearish" | "risk_off" | "unknown";
  newsSentiment?: "positive" | "neutral" | "negative" | "unknown";
  disclosureRisk?: "none" | "low" | "medium" | "high" | "unknown";
  fundamentalStatus?:
    | "UNDERVALUED"
    | "FAIR"
    | "OVERVALUED"
    | "VALUE_TRAP"
    | "INSUFFICIENT_DATA"
    | "unknown";
  sectorRotation?: "leading" | "neutral" | "lagging" | "unknown";
}

export interface ExitEvaluationResult {
  triggered: boolean;
  intent: "HOLD" | "SELL" | "MONITOR";
  managementStatus: ManagementStatus;
  exitReason?: ExitReason;
  proximityPct?: number; // % distance to level (positive number)
  reasons: string[];
  warnings: string[];
}

// ---------------- Defaults & risk-mode tuning ----------------

const FALLBACK_STOP_PCT: Record<RiskMode, number> = {
  conservative: 0.04,
  balanced: 0.06,
  progressive: 0.08,
  expert: 0.06,
};

const MIN_RR: Record<RiskMode, number> = {
  conservative: 1.8,
  balanced: 1.5,
  progressive: 1.3,
  expert: 1.5,
};

const TRAILING_ACTIVATION_PCT: Record<RiskMode, number> = {
  conservative: 0.025,
  balanced: 0.03,
  progressive: 0.04,
  expert: 0.03,
};

const TRAILING_PCT: Record<RiskMode, number> = {
  conservative: 0.02,
  balanced: 0.03,
  progressive: 0.04,
  expert: 0.03,
};

const NEAR_STOP_DISTANCE_PCT = 0.02; // within 2% above stop
const NEAR_TAKE_PROFIT_DISTANCE_PCT = 0.02; // within 2% below TP

// ---------------- Exit plan creation ----------------

export interface BuildExitPlanInput {
  entryPrice: number;
  atr?: number | null;
  riskMode?: RiskMode;
  customStopPct?: number;
  customRr?: number;
}

export interface BuiltExitPlan {
  stopLoss: number;
  takeProfit: number;
  trailingStopPct: number;
  trailingActivationPct: number;
  riskRewardRatio: number;
  reason: string;
  warnings: string[];
}

/**
 * Build initial exit plan after a paper BUY.
 * Uses ATR-based stop when ATR is available, otherwise falls back to %.
 */
export function buildExitPlan(input: BuildExitPlanInput): BuiltExitPlan {
  const mode: RiskMode = input.riskMode ?? "balanced";
  const warnings: string[] = [];
  const entry = input.entryPrice;

  let stopLoss: number;
  let basis: string;

  if (input.atr && input.atr > 0) {
    const mult = mode === "conservative" ? 1.2 : mode === "progressive" ? 2.0 : 1.5;
    stopLoss = Math.max(0.0001, entry - input.atr * mult);
    basis = `atr*${mult}`;
  } else {
    const pct = input.customStopPct ?? FALLBACK_STOP_PCT[mode];
    stopLoss = entry * (1 - pct);
    basis = `fallback_pct_${(pct * 100).toFixed(1)}`;
    warnings.push("atr_unavailable_using_fallback_stop");
  }

  const rr = input.customRr ?? MIN_RR[mode];
  const risk = entry - stopLoss;
  const takeProfit = entry + risk * rr;

  return {
    stopLoss,
    takeProfit,
    trailingStopPct: TRAILING_PCT[mode],
    trailingActivationPct: TRAILING_ACTIVATION_PCT[mode],
    riskRewardRatio: rr,
    reason: `auto_plan(${basis},rr=${rr})`,
    warnings,
  };
}

// ---------------- PATCH 4: Stop loss ----------------

export function evaluateStopLoss(
  position: PositionSnapshot,
  plan: ExitPlanInput,
  market: MarketContext = {},
): ExitEvaluationResult {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const price = position.currentPrice;
  const stop = plan.stopLoss ?? null;

  if (!stop || stop <= 0 || !Number.isFinite(price)) {
    return {
      triggered: false,
      intent: "MONITOR",
      managementStatus: "MONITOR",
      reasons: ["no_stop_loss_defined"],
      warnings: ["exit_plan_missing_stop_loss"],
    };
  }

  if (price <= stop) {
    return {
      triggered: true,
      intent: "SELL",
      managementStatus: "STOP_LOSS_TRIGGERED",
      exitReason: "stop_loss_triggered",
      reasons: [
        `price ${price.toFixed(2)} <= stop ${stop.toFixed(2)}`,
        market.regime === "risk_off" ? "regime_risk_off" : "",
      ].filter(Boolean),
      warnings,
    };
  }

  const distancePct = (price - stop) / price;
  if (distancePct <= NEAR_STOP_DISTANCE_PCT) {
    if (market.disclosureRisk === "high") {
      warnings.push("near_stop_with_high_disclosure_risk");
    }
    return {
      triggered: false,
      intent: "MONITOR",
      managementStatus: "NEAR_STOP_LOSS",
      proximityPct: distancePct,
      reasons: [`within ${(distancePct * 100).toFixed(2)}% of stop`],
      warnings,
    };
  }

  return {
    triggered: false,
    intent: "HOLD",
    managementStatus: "HOLDING",
    proximityPct: distancePct,
    reasons: [],
    warnings,
  };
}

// ---------------- PATCH 5: Take profit ----------------

export function evaluateTakeProfit(
  position: PositionSnapshot,
  plan: ExitPlanInput,
  market: MarketContext = {},
): ExitEvaluationResult {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const price = position.currentPrice;
  const tp = plan.takeProfit ?? null;

  if (!tp || tp <= 0 || !Number.isFinite(price)) {
    return {
      triggered: false,
      intent: "MONITOR",
      managementStatus: "MONITOR",
      reasons: ["no_take_profit_defined"],
      warnings: ["exit_plan_missing_take_profit"],
    };
  }

  if (price >= tp) {
    // Bullish momentum + non-risk-off → suggest trailing instead of full exit
    if (market.regime === "bullish" && market.newsSentiment !== "negative") {
      return {
        triggered: false,
        intent: "HOLD",
        managementStatus: "TRAILING_STOP_ACTIVE",
        reasons: [
          `price ${price.toFixed(2)} >= take_profit ${tp.toFixed(2)}`,
          "bullish_regime_prefer_trailing",
        ],
        warnings,
      };
    }
    return {
      triggered: true,
      intent: "SELL",
      managementStatus: "TAKE_PROFIT_TRIGGERED",
      exitReason: "take_profit_triggered",
      reasons: [
        `price ${price.toFixed(2)} >= take_profit ${tp.toFixed(2)}`,
        market.regime === "risk_off" ? "regime_risk_off_lock_profit" : "",
      ].filter(Boolean),
      warnings,
    };
  }

  const distancePct = (tp - price) / price;
  if (distancePct <= NEAR_TAKE_PROFIT_DISTANCE_PCT) {
    return {
      triggered: false,
      intent: "MONITOR",
      managementStatus: "NEAR_TAKE_PROFIT",
      proximityPct: distancePct,
      reasons: [`within ${(distancePct * 100).toFixed(2)}% of take_profit`],
      warnings,
    };
  }

  return {
    triggered: false,
    intent: "HOLD",
    managementStatus: "HOLDING",
    proximityPct: distancePct,
    reasons: [],
    warnings,
  };
}

// ---------------- PATCH 6: Trailing stop ----------------

export interface TrailingStopUpdate extends ExitEvaluationResult {
  newTrailingStop: number | null;
  newHighestPrice: number;
  activated: boolean;
}

export function evaluateTrailingStop(
  position: PositionSnapshot,
  plan: ExitPlanInput,
  opts: { riskMode?: RiskMode } = {},
): TrailingStopUpdate {
  const mode: RiskMode = opts.riskMode ?? "balanced";
  const activationPct = TRAILING_ACTIVATION_PCT[mode];
  const trailingPct = plan.trailingStopPct ?? TRAILING_PCT[mode];
  const price = position.currentPrice;
  const entry = position.avgEntry;
  const prevHigh = Math.max(
    plan.highestPriceSinceEntry ?? 0,
    position.highestPriceSinceEntry ?? 0,
    entry,
  );
  const newHigh = Math.max(prevHigh, price);
  const unrealizedPnlPct = entry > 0 ? (price - entry) / entry : 0;
  const activated = plan.trailingActivated || unrealizedPnlPct >= activationPct;

  if (!activated) {
    return {
      triggered: false,
      intent: "HOLD",
      managementStatus: "HOLDING",
      reasons: [`trailing_not_activated (pnl ${(unrealizedPnlPct * 100).toFixed(2)}%)`],
      warnings: [],
      newTrailingStop: plan.trailingStop ?? null,
      newHighestPrice: newHigh,
      activated: false,
    };
  }

  // Never lower the trailing stop
  const candidate = newHigh * (1 - trailingPct);
  const newTrailingStop = Math.max(plan.trailingStop ?? 0, candidate);

  if (price <= newTrailingStop) {
    return {
      triggered: true,
      intent: "SELL",
      managementStatus: "TRAILING_STOP_TRIGGERED",
      exitReason: "trailing_stop_triggered",
      reasons: [
        `price ${price.toFixed(2)} <= trailing ${newTrailingStop.toFixed(2)}`,
        `high ${newHigh.toFixed(2)}`,
      ],
      warnings: [],
      newTrailingStop,
      newHighestPrice: newHigh,
      activated: true,
    };
  }

  return {
    triggered: false,
    intent: "HOLD",
    managementStatus: "TRAILING_STOP_ACTIVE",
    reasons: [
      `trailing_active stop=${newTrailingStop.toFixed(2)} high=${newHigh.toFixed(2)}`,
    ],
    warnings: [],
    newTrailingStop,
    newHighestPrice: newHigh,
    activated: true,
  };
}

// ---------------- PATCH 7: Hold / Exit / Reduce scoring ----------------

export interface HoldExitInput {
  position: PositionSnapshot;
  plan?: ExitPlanInput;
  market?: MarketContext;
  strategyEdgeScore?: number; // 0..100 from strategy intelligence
  riskEnginePaused?: boolean; // BUY pause only — does not block exits
}

export interface HoldExitResult {
  holdScore: number; // 0..100
  exitScore: number; // 0..100
  reduceScore: number; // 0..100
  action: HoldExitAction;
  managementStatus: ManagementStatus;
  reasons: string[];
  warnings: string[];
}

export function calculateHoldExitScore(input: HoldExitInput): HoldExitResult {
  const { position, plan = {}, market = {} } = input;
  const reasons: string[] = [];
  const warnings: string[] = [];

  const entry = position.avgEntry;
  const price = position.currentPrice;
  const pnlPct = entry > 0 ? (price - entry) / entry : 0;

  let hold = 50;
  let exit = 20;
  let reduce = 10;

  // P&L contribution
  if (pnlPct >= 0.05) {
    hold += 15;
    reasons.push("profit_above_5pct");
  } else if (pnlPct >= 0.02) {
    hold += 8;
  } else if (pnlPct <= -0.05) {
    exit += 20;
    reduce += 10;
    reasons.push("loss_below_-5pct");
  } else if (pnlPct <= -0.02) {
    reduce += 10;
  }

  // Market regime
  switch (market.regime) {
    case "bullish":
      hold += 10;
      break;
    case "risk_off":
      exit += 20;
      reduce += 15;
      reasons.push("regime_risk_off");
      break;
    case "bearish":
      exit += 10;
      reduce += 10;
      break;
  }

  // News sentiment
  if (market.newsSentiment === "negative") {
    exit += 10;
    reduce += 5;
    reasons.push("news_negative");
  } else if (market.newsSentiment === "positive") {
    hold += 5;
  }

  // Disclosure risk (highest priority risk signal)
  if (market.disclosureRisk === "high") {
    exit += 25;
    reduce += 10;
    reasons.push("disclosure_risk_high");
  } else if (market.disclosureRisk === "medium") {
    reduce += 10;
  }

  // Fundamental
  if (market.fundamentalStatus === "VALUE_TRAP") {
    exit += 15;
    reasons.push("fundamental_value_trap");
  } else if (market.fundamentalStatus === "OVERVALUED" && pnlPct > 0) {
    reduce += 10;
  }

  // Strategy edge
  if (typeof input.strategyEdgeScore === "number") {
    if (input.strategyEdgeScore >= 70) hold += 5;
    if (input.strategyEdgeScore <= 30) exit += 5;
  }

  // Proximity-based promotion via plan
  if (plan.stopLoss && price > 0) {
    const distToStop = (price - plan.stopLoss) / price;
    if (distToStop <= NEAR_STOP_DISTANCE_PCT && distToStop > 0) {
      exit += 10;
      reasons.push("near_stop_loss");
    }
  }
  if (plan.takeProfit && price > 0) {
    const distToTp = (plan.takeProfit - price) / price;
    if (distToTp <= NEAR_TAKE_PROFIT_DISTANCE_PCT && distToTp > 0) {
      hold += 5;
      reasons.push("near_take_profit");
    }
  }

  // Clamp
  hold = Math.max(0, Math.min(100, hold));
  exit = Math.max(0, Math.min(100, exit));
  reduce = Math.max(0, Math.min(100, reduce));

  // Decide action
  let action: HoldExitAction = "HOLD";
  let managementStatus: ManagementStatus = "HOLDING";

  if (exit >= 65) {
    action = "EXIT";
    managementStatus = "EXIT_SUGGESTED";
  } else if (reduce >= 55 && pnlPct > -0.05) {
    action = "REDUCE";
    managementStatus = "REDUCE_SUGGESTED";
  } else if (market.regime === "risk_off" || exit >= 45) {
    action = "MONITOR_RISK";
    managementStatus = "MONITOR_RISK";
  } else if (hold >= 60) {
    action = "HOLD";
    managementStatus = "HOLDING";
  } else {
    action = "MONITOR";
    managementStatus = "MONITOR";
  }

  if (input.riskEnginePaused) {
    warnings.push("buy_risk_paused_exits_still_allowed");
  }

  return {
    holdScore: hold,
    exitScore: exit,
    reduceScore: reduce,
    action,
    managementStatus,
    reasons,
    warnings,
  };
}

// ---------------- PATCH 8: Average down guard ----------------

export interface AddToPositionInput {
  position: PositionSnapshot;
  candidatePrice: number;
  candidateLot: number;
  context: {
    market?: MarketContext;
    sectorExposurePct?: number; // 0..1
    positionWeightPct?: number; // 0..1 of equity after add
    maxSectorExposurePct?: number;
    maxPositionWeightPct?: number;
    cashBufferPct?: number; // 0..1
    minCashBufferPct?: number;
    technicalReversalConfirmed?: boolean;
    fundamentalStatus?: MarketContext["fundamentalStatus"];
    allowTechnicalOnly?: boolean;
  };
}

export interface AddToPositionResult {
  allowed: boolean;
  mode: "AVERAGE_DOWN" | "AVERAGE_UP" | "ADD";
  blockedReasons: string[];
  warnings: string[];
  reason: string;
}

export function evaluateAddToPosition(input: AddToPositionInput): AddToPositionResult {
  const { position, candidatePrice, context } = input;
  const blocked: string[] = [];
  const warnings: string[] = [];
  const mode: AddToPositionResult["mode"] =
    candidatePrice < position.avgEntry
      ? "AVERAGE_DOWN"
      : candidatePrice > position.avgEntry
        ? "AVERAGE_UP"
        : "ADD";

  const pnlPct =
    position.avgEntry > 0
      ? (candidatePrice - position.avgEntry) / position.avgEntry
      : 0;

  if (mode === "AVERAGE_DOWN") {
    // Must be losing but not catastrophic
    if (pnlPct <= -0.12) blocked.push("losing_position_too_deep");

    if (
      context.fundamentalStatus === "INSUFFICIENT_DATA" &&
      !context.allowTechnicalOnly
    ) {
      blocked.push("insufficient_fundamental_validation");
    }
    if (context.fundamentalStatus === "VALUE_TRAP") {
      blocked.push("fundamental_value_trap");
    }
    if (context.market?.disclosureRisk === "high") {
      blocked.push("negative_disclosure_detected");
    }
    if (!context.technicalReversalConfirmed) {
      blocked.push("losing_position_no_reversal");
    }
  }

  // Exposure limits apply to any add
  if (
    context.positionWeightPct != null &&
    context.maxPositionWeightPct != null &&
    context.positionWeightPct > context.maxPositionWeightPct
  ) {
    blocked.push("position_weight_limit");
  }
  if (
    context.sectorExposurePct != null &&
    context.maxSectorExposurePct != null &&
    context.sectorExposurePct > context.maxSectorExposurePct
  ) {
    blocked.push("sector_exposure_limit");
  }
  if (
    context.cashBufferPct != null &&
    context.minCashBufferPct != null &&
    context.cashBufferPct < context.minCashBufferPct
  ) {
    blocked.push("cash_buffer_low");
  }

  if (context.market?.regime === "risk_off") {
    warnings.push("regime_risk_off_consider_skip");
  }

  return {
    allowed: blocked.length === 0,
    mode,
    blockedReasons: blocked,
    warnings,
    reason:
      blocked.length === 0
        ? `${mode.toLowerCase()}_allowed`
        : `blocked:${blocked.join(",")}`,
  };
}

// ---------------- PATCH 11: Decision type helpers ----------------

export type PositionDecisionType =
  | "POSITION_MONITOR"
  | "HOLD_POSITION"
  | "MONITOR_RISK"
  | "STOP_LOSS_EXIT"
  | "TAKE_PROFIT_EXIT"
  | "TRAILING_STOP_EXIT"
  | "RISK_EXIT"
  | "REDUCE_POSITION"
  | "EXIT_SUGGESTED"
  | "REBALANCE_SUGGESTED";

export function mapEvaluationToDecisionType(
  ev: ExitEvaluationResult,
): PositionDecisionType {
  switch (ev.managementStatus) {
    case "STOP_LOSS_TRIGGERED":
      return "STOP_LOSS_EXIT";
    case "TAKE_PROFIT_TRIGGERED":
      return "TAKE_PROFIT_EXIT";
    case "TRAILING_STOP_TRIGGERED":
      return "TRAILING_STOP_EXIT";
    case "REDUCE_SUGGESTED":
      return "REDUCE_POSITION";
    case "EXIT_SUGGESTED":
      return "EXIT_SUGGESTED";
    case "MONITOR_RISK":
    case "NEAR_STOP_LOSS":
      return "MONITOR_RISK";
    case "HOLDING":
      return "HOLD_POSITION";
    default:
      return "POSITION_MONITOR";
  }
}

/**
 * Aggregate stop/TP/trailing into a single intent.
 * Priority: stop loss > trailing > take profit > hold/exit score.
 */
export function combineExitSignals(args: {
  stop: ExitEvaluationResult;
  takeProfit: ExitEvaluationResult;
  trailing: TrailingStopUpdate;
  holdExit: HoldExitResult;
}): ExitEvaluationResult & { decisionType: PositionDecisionType } {
  const { stop, takeProfit, trailing, holdExit } = args;

  if (stop.triggered) {
    return { ...stop, decisionType: mapEvaluationToDecisionType(stop) };
  }
  if (trailing.triggered) {
    return { ...trailing, decisionType: mapEvaluationToDecisionType(trailing) };
  }
  if (takeProfit.triggered) {
    return { ...takeProfit, decisionType: mapEvaluationToDecisionType(takeProfit) };
  }

  // No hard trigger — fold hold/exit score into the result
  const result: ExitEvaluationResult = {
    triggered: false,
    intent:
      holdExit.action === "EXIT"
        ? "SELL"
        : holdExit.action === "REDUCE"
          ? "SELL"
          : holdExit.action === "MONITOR" || holdExit.action === "MONITOR_RISK"
            ? "MONITOR"
            : "HOLD",
    managementStatus: holdExit.managementStatus,
    reasons: [
      ...stop.reasons,
      ...takeProfit.reasons,
      ...trailing.reasons,
      ...holdExit.reasons,
    ],
    warnings: [
      ...stop.warnings,
      ...takeProfit.warnings,
      ...trailing.warnings,
      ...holdExit.warnings,
    ],
  };
  return { ...result, decisionType: mapEvaluationToDecisionType(result) };
}
