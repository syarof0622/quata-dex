// Swing Max trade engine. PURE LOGIC, no DB. PAPER TRADING ONLY.
//
// Purpose: produce a disciplined swing-trade plan (entry type, stop, TP1/TP2,
// invalidation, holding window) and gate BUY/SELL decisions so the AI Trade
// Agent does NOT behave like an intraday scalper.
//
// Spec covered: PATCHES 2, 3, 4, 5, 6, 7, 8, 9, 10, 16, 20.

export type SwingEntryType =
  | "PULLBACK_TO_SUPPORT"
  | "BREAKOUT_CONFIRMATION"
  | "SECTOR_ROTATION_SWING"
  | "CATALYST_SWING";

export type SwingPlanStatus =
  | "PLANNED" | "ACTIVE" | "MONITOR" | "NEAR_STOP" | "NEAR_TP1"
  | "TP1_HIT" | "TRAILING_ACTIVE" | "TIME_STOP_WARNING" | "EXIT_TRIGGERED" | "CLOSED";

export type SwingCandidate = {
  symbol: string;
  price: number;                                  // last price
  // Technicals
  techScore?: number | null;                      // -100..100
  techLabel?: string | null;                      // BUY/HOLD/SELL
  aboveEMA20?: boolean | null;
  aboveEMA50?: boolean | null;
  ema20AboveEma50?: boolean | null;
  higherHigh?: boolean | null;                    // optional structure
  higherLow?: boolean | null;
  breakout?: boolean | null;
  breakoutLevel?: number | null;
  recentSwingLow?: number | null;                 // structural stop reference
  supportLevel?: number | null;
  resistanceLevel?: number | null;
  nearestResistance?: number | null;
  nextResistance?: number | null;
  ema20?: number | null;
  ema50?: number | null;
  atrPct?: number | null;                         // daily ATR % of price
  rsi?: number | null;
  // Multi-timeframe
  weeklyTrend?: "bullish" | "bearish" | "neutral" | null;
  dailySignalImproving?: boolean | null;
  // Volume / liquidity
  rvol?: number | null;                           // 0..N
  valueTradedIDR?: number | null;
  volumeConfirmed?: boolean | null;
  // Relative strength
  rsVsIHSG?: number | null;                       // -1..1 normalized
  rsVsSector?: number | null;
  sectorRotation?: "leading" | "rotating_in" | "neutral" | "rotating_out" | "lagging" | null;
  // Market regime / risk
  marketRegime?: string | null;
  ihsgBias?: "bullish" | "bearish" | "neutral" | null;
  volatilityLabel?: "low" | "medium" | "high" | null;
  // News / disclosure
  highImpactNegativeDisclosure?: boolean | null;
  newsBias?: number | null;
  sentScore?: number | null;
  newsStale?: boolean | null;
  // Intraday discipline
  intradayChangePct?: number | null;              // % change today
  intradayCloseLocation?: number | null;          // 0..1 close vs day-range
  // Cooldown / strategy
  symbolCooldownActive?: boolean | null;
  symbolLossStreak?: number | null;
  strategyPaused?: boolean | null;
  // Session
  marketSessionLabel?: string | null;             // "session_1" | "lunch" | "session_2" | "pre_open" | "post_close" | "closing_auction"
  minutesSinceOpen?: number | null;
};

export type SwingContext = {
  agentEquity: number | null;
  riskPerTradePct: number;                        // 0.005–0.008
  minPositionWeightPct: number;                   // 0.04
  maxPositionWeightPct: number;                   // 0.08
  qualityThreshold: number;                       // 78
  minRR: number;                                  // 2.0
  targetHoldingDays: number;                      // 3
  maxHoldingDays: number;                         // 7
  timeStopWarningDays: number;                    // 3
  swingProtectionActive?: boolean | null;
};

export type SwingQualityResult = {
  score: number;                                  // 0..100
  reasons: string[];
  warnings: string[];
  entryType: SwingEntryType | null;
  blockedReason: string | null;
};

export type SwingPlan = {
  symbol: string;
  entryType: SwingEntryType;
  entryPrice: number;
  entryZoneLow: number;
  entryZoneHigh: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  trailingActivation: number;                     // price at/after which trailing turns on
  invalidationLevel: number;
  riskRewardRatio: number;
  swingQualityScore: number;
  targetHoldingDays: number;
  maxHoldingDays: number;
  minHoldingUntilISO: string;                     // T+1 trading day floor
  timeStopAtISO: string;                          // soft warning timestamp
  reasons: string[];
  warnings: string[];
  positionSizeIDR: number;                        // recommended notional
  status: SwingPlanStatus;
};

export type SwingEntryEvaluation = {
  allowed: boolean;
  blockedReasons: string[];
  warnings: string[];
  quality: SwingQualityResult;
  plan: SwingPlan | null;
};

export type SwingExitEvaluation = {
  shouldExit: boolean;
  reason:
    | "stop_loss_triggered" | "take_profit_triggered" | "trailing_stop_triggered"
    | "time_stop_triggered" | "invalidation_break" | "disclosure_exit"
    | "regime_emergency" | null;
  exitType: "FULL" | "PARTIAL" | "NONE";
  newStatus: SwingPlanStatus;
  detail: string;
};

// ─── Constants ───────────────────────────────────────────────────────────────
const SESSION_MS = 24 * 3600_000;
const MIN_HOLD_TRADING_DAY_MS = 1 * SESSION_MS; // ≈ 1 trading day floor

// ─── Quality scoring ─────────────────────────────────────────────────────────
export function calculateSwingQualityScore(c: SwingCandidate, _ctx: SwingContext): SwingQualityResult {
  const reasons: string[] = [];
  const warnings: string[] = [];
  let score = 50;
  let entryType: SwingEntryType | null = null;
  let blocked: string | null = null;

  // 1. Trend structure ──────────────────────────────────────────────────────
  const tech = Number(c.techScore ?? 0);
  if (tech <= -25) { score -= 18; reasons.push("clear_downtrend"); blocked = blocked ?? "downtrend"; }
  else if (tech >= 30) { score += 12; reasons.push("strong_uptrend"); }
  else if (tech >= 10) { score += 6; reasons.push("uptrend"); }

  if (c.aboveEMA20) { score += 5; reasons.push("above_ema20"); }
  else if (c.aboveEMA20 === false) { score -= 6; reasons.push("below_ema20"); }
  if (c.aboveEMA50) { score += 4; reasons.push("above_ema50"); }
  else if (c.aboveEMA50 === false) { score -= 4; reasons.push("below_ema50"); }
  if (c.ema20AboveEma50) { score += 4; reasons.push("ema20>ema50"); }
  if (c.higherHigh && c.higherLow) { score += 4; reasons.push("hh_hl_structure"); }

  // 2. Multi-timeframe ──────────────────────────────────────────────────────
  if (c.weeklyTrend === "bearish") {
    score -= 12; reasons.push("weekly_bearish");
    blocked = blocked ?? "weekly_bearish_blocks_swing_buy";
  } else if (c.weeklyTrend === "bullish") { score += 6; reasons.push("weekly_bullish"); }
  if (c.dailySignalImproving) { score += 3; reasons.push("daily_signal_improving"); }

  // 3. Relative strength ────────────────────────────────────────────────────
  const rsI = Number(c.rsVsIHSG ?? 0);
  if (rsI > 0.05) { score += 5; reasons.push("rs_vs_ihsg_positive"); }
  else if (rsI < -0.05) { score -= 6; reasons.push("rs_vs_ihsg_negative"); }
  const rsS = Number(c.rsVsSector ?? 0);
  if (rsS > 0.05) { score += 3; reasons.push("rs_vs_sector_positive"); }
  switch (c.sectorRotation) {
    case "leading": score += 5; reasons.push("sector_leading"); break;
    case "rotating_in": score += 3; reasons.push("sector_rotating_in"); break;
    case "rotating_out": score -= 5; reasons.push("sector_rotating_out"); break;
    case "lagging": score -= 3; reasons.push("sector_lagging"); break;
  }

  // 4. Volume confirmation ──────────────────────────────────────────────────
  const rvol = Number(c.rvol ?? 0);
  if (rvol >= 1.5) { score += 6; reasons.push("rvol_strong"); }
  else if (rvol >= 1.2) { score += 3; reasons.push("rvol_ok"); }
  else if (rvol > 0 && rvol < 1.0) { score -= 4; reasons.push("weak_rvol"); warnings.push("Volume below average."); }
  if (c.volumeConfirmed === false) { score -= 3; reasons.push("volume_not_confirmed"); }
  const v = Number(c.valueTradedIDR ?? 0);
  if (v > 0 && v < 1e9) { score -= 6; reasons.push("low_liquidity"); }

  // 5. Pullback / breakout classification ──────────────────────────────────
  const ema20 = Number(c.ema20 ?? 0);
  const price = Number(c.price ?? 0);
  const pullbackOk = c.aboveEMA20 && ema20 > 0 && price > ema20 &&
    (price - ema20) / ema20 < 0.04; // within 4% of EMA20
  if (pullbackOk && tech >= 0) {
    entryType = "PULLBACK_TO_SUPPORT";
    score += 6; reasons.push("valid_pullback_to_ema20");
  }
  if (c.breakout && c.breakoutLevel && price >= c.breakoutLevel) {
    // closes near or above breakout
    const extension = (price - Number(c.breakoutLevel)) / Number(c.breakoutLevel);
    if (extension <= 0.04) {
      entryType = entryType ?? "BREAKOUT_CONFIRMATION";
      score += 6; reasons.push("breakout_with_room");
    } else {
      score -= 4; reasons.push("breakout_too_extended"); warnings.push("Breakout extended >4%.");
    }
  }
  if (!entryType) {
    if (c.sectorRotation === "leading" || c.sectorRotation === "rotating_in") {
      if (rsS > 0.05 || rsI > 0.05) entryType = "SECTOR_ROTATION_SWING";
    }
  }
  if (!entryType && Number(c.newsBias ?? 0) >= 2 && !c.highImpactNegativeDisclosure) {
    entryType = "CATALYST_SWING";
    score += 3; reasons.push("positive_catalyst");
  }
  if (!entryType) {
    blocked = blocked ?? "no_valid_swing_entry_type";
  }

  // 6. Overextension guard (Patch 5) ────────────────────────────────────────
  if (ema20 > 0 && price > 0) {
    const extPct = (price - ema20) / ema20 * 100;
    if (extPct > 8) { blocked = "price_extended_>8pct_above_ema20"; reasons.push("overextended_ema20"); }
  }
  const intraday = Number(c.intradayChangePct ?? 0);
  const closeLoc = Number(c.intradayCloseLocation ?? 1);
  if (intraday > 8 && closeLoc < 0.7) { blocked = "intraday_spike_failed_close"; reasons.push("intraday_spike_failure"); }
  const rsi = Number(c.rsi ?? 0);
  if (rsi >= 80) { score -= 6; reasons.push("rsi_extreme_overbought"); warnings.push("RSI overbought; wait for pullback."); }

  // 7. Market regime ────────────────────────────────────────────────────────
  const regime = String(c.marketRegime ?? "").toLowerCase();
  const riskOff = /risk_off|bear|defensive|crash/.test(regime);
  if (riskOff) {
    score -= 6; reasons.push("regime_risk_off");
    if (score < 82) warnings.push("Risk-off regime: needs swing score ≥82.");
  }
  if (c.ihsgBias === "bearish") { score -= 3; reasons.push("ihsg_bearish"); }
  if (c.volatilityLabel === "high") { score -= 4; reasons.push("high_volatility"); }

  // 8. News / disclosure ───────────────────────────────────────────────────
  if (c.highImpactNegativeDisclosure) { blocked = "high_impact_negative_disclosure"; reasons.push("blocking_disclosure"); }
  const nb = Number(c.newsBias ?? 0);
  if (nb <= -1.5) { score -= 6; reasons.push("negative_news_bias"); }
  else if (nb >= 1.5) { score += 3; reasons.push("positive_news_bias"); }
  if (c.newsStale) warnings.push("News data is stale.");

  // 9. Cooldown / strategy gates ────────────────────────────────────────────
  if (c.symbolCooldownActive) { blocked = "symbol_cooldown_active"; reasons.push("symbol_in_cooldown"); }
  if ((c.symbolLossStreak ?? 0) >= 2) { score -= 8; reasons.push("recent_symbol_losses"); }
  if (c.strategyPaused) { blocked = "strategy_paused"; reasons.push("strategy_kill_switch_active"); }

  // 10. Session windows (Patch 3) ──────────────────────────────────────────
  const session = String(c.marketSessionLabel ?? "").toLowerCase();
  if (session === "closing_auction" || session === "post_close") {
    blocked = blocked ?? "session_closed";
  }
  if (session === "lunch") {
    blocked = blocked ?? "lunch_break";
  }
  const msoOpen = Number(c.minutesSinceOpen ?? 999);
  if (session === "session_1" && msoOpen >= 0 && msoOpen < 15) {
    blocked = blocked ?? "within_first_15min_of_open";
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, reasons, warnings, entryType, blockedReason: blocked };
}

// ─── Plan builder ────────────────────────────────────────────────────────────
export function buildSwingTradePlan(c: SwingCandidate, ctx: SwingContext): SwingPlan | null {
  const q = calculateSwingQualityScore(c, ctx);
  if (q.blockedReason || !q.entryType) return null;

  const price = Number(c.price);
  if (!(price > 0)) return null;

  // Structural stop: priority swing low > support > EMA20/50 > ATR > pct
  const candidates: { level: number; src: string }[] = [];
  if (c.recentSwingLow && c.recentSwingLow < price) candidates.push({ level: c.recentSwingLow, src: "swing_low" });
  if (c.supportLevel && c.supportLevel < price) candidates.push({ level: c.supportLevel, src: "support" });
  if (c.ema20 && c.ema20 < price) candidates.push({ level: c.ema20 * 0.985, src: "ema20-1.5%" });
  if (c.ema50 && c.ema50 < price) candidates.push({ level: c.ema50 * 0.985, src: "ema50-1.5%" });
  const atrPct = Math.max(1.5, Math.min(6, Number(c.atrPct ?? 3)));
  candidates.push({ level: price * (1 - atrPct / 100), src: "atr_fallback" });

  // pick the deepest sensible stop within 2.5–5.5% range; else block
  let stop = candidates
    .map(x => ({ ...x, dist: (price - x.level) / price * 100 }))
    .filter(x => x.dist >= 2.5 && x.dist <= 5.5)
    .sort((a, b) => a.dist - b.dist)[0];
  if (!stop) {
    // try wider fallback up to 6%; otherwise block (stop too wide or too tight)
    const widened = candidates
      .map(x => ({ ...x, dist: (price - x.level) / price * 100 }))
      .filter(x => x.dist >= 2.0 && x.dist <= 6.0)
      .sort((a, b) => a.dist - b.dist)[0];
    if (!widened) return null;
    stop = widened;
  }
  const stopLoss = +stop.level.toFixed(4);
  const stopDistPct = +stop.dist.toFixed(2);
  if (stopDistPct > 6) return null;

  // Take profit
  const riskPerShare = price - stopLoss;
  const tp1FromR = price + riskPerShare * 1.5;
  const tp2FromR = price + riskPerShare * 2.5;
  const tp1 = c.nearestResistance && c.nearestResistance > price
    ? Math.min(tp1FromR, c.nearestResistance)
    : tp1FromR;
  const tp2 = c.nextResistance && c.nextResistance > tp1
    ? Math.max(tp2FromR, c.nextResistance)
    : tp2FromR;
  const rr = +((tp2 - price) / (price - stopLoss)).toFixed(2);
  if (!isFinite(rr) || rr < ctx.minRR) return null;
  if (q.score < ctx.qualityThreshold) return null;

  // Position sizing — risk-based
  const equity = Math.max(0, Number(ctx.agentEquity ?? 0));
  const riskBudget = equity * ctx.riskPerTradePct;
  let positionSizeIDR = riskPerShare > 0 ? (riskBudget / riskPerShare) * price : 0;
  // Reduce in risk-off / high vol / protection mode
  const regime = String(c.marketRegime ?? "").toLowerCase();
  if (/risk_off|bear|crash/.test(regime)) positionSizeIDR *= 0.6;
  if (c.volatilityLabel === "high") positionSizeIDR *= 0.7;
  if (ctx.swingProtectionActive) positionSizeIDR *= 0.5;
  // Cap to weight bands
  positionSizeIDR = Math.min(positionSizeIDR, equity * ctx.maxPositionWeightPct);
  positionSizeIDR = Math.max(positionSizeIDR, equity * ctx.minPositionWeightPct);
  positionSizeIDR = Math.round(positionSizeIDR);

  const now = Date.now();
  return {
    symbol: c.symbol,
    entryType: q.entryType,
    entryPrice: price,
    entryZoneLow: +(price * 0.997).toFixed(4),
    entryZoneHigh: +(price * 1.003).toFixed(4),
    stopLoss,
    takeProfit1: +tp1.toFixed(4),
    takeProfit2: +tp2.toFixed(4),
    trailingActivation: +(price + riskPerShare * 1.0).toFixed(4),
    invalidationLevel: +(stopLoss * 0.99).toFixed(4),
    riskRewardRatio: rr,
    swingQualityScore: q.score,
    targetHoldingDays: ctx.targetHoldingDays,
    maxHoldingDays: ctx.maxHoldingDays,
    minHoldingUntilISO: new Date(now + MIN_HOLD_TRADING_DAY_MS).toISOString(),
    timeStopAtISO: new Date(now + ctx.timeStopWarningDays * SESSION_MS).toISOString(),
    reasons: q.reasons,
    warnings: q.warnings,
    positionSizeIDR,
    status: "PLANNED",
  };
}

// ─── Entry evaluation ────────────────────────────────────────────────────────
export function evaluateSwingEntry(c: SwingCandidate, ctx: SwingContext): SwingEntryEvaluation {
  const quality = calculateSwingQualityScore(c, ctx);
  const warnings = [...quality.warnings];
  const blocked: string[] = [];
  if (quality.blockedReason) blocked.push(quality.blockedReason);
  if (quality.score < ctx.qualityThreshold) blocked.push(`swing_quality_below_threshold(${quality.score}<${ctx.qualityThreshold})`);
  if (ctx.swingProtectionActive && quality.score < 85) blocked.push("swing_protection_requires_score_>=85");

  if (blocked.length > 0) {
    return { allowed: false, blockedReasons: blocked, warnings, quality, plan: null };
  }
  const plan = buildSwingTradePlan(c, ctx);
  if (!plan) {
    return { allowed: false, blockedReasons: ["no_valid_swing_plan(stop/RR/sizing)"], warnings, quality, plan: null };
  }
  return { allowed: true, blockedReasons: [], warnings, quality, plan };
}

// ─── Exit evaluators ─────────────────────────────────────────────────────────
export type SwingPositionLike = {
  symbol: string;
  openedAt: string | Date;
  qty: number;
  avgPrice: number;
  lastPrice: number;
};

export function evaluateSwingExit(
  pos: SwingPositionLike,
  plan: SwingPlan,
  ctx: { highImpactNegativeDisclosure?: boolean; regimeEmergency?: boolean },
): SwingExitEvaluation {
  const ageMs = Date.now() - new Date(pos.openedAt).getTime();
  const minHoldOk = ageMs >= MIN_HOLD_TRADING_DAY_MS;
  const price = pos.lastPrice;

  // Hard exits ignore min hold
  if (ctx.highImpactNegativeDisclosure) {
    return { shouldExit: true, reason: "disclosure_exit", exitType: "FULL", newStatus: "EXIT_TRIGGERED", detail: "High-impact negative disclosure." };
  }
  if (ctx.regimeEmergency) {
    return { shouldExit: true, reason: "regime_emergency", exitType: "FULL", newStatus: "EXIT_TRIGGERED", detail: "Regime emergency / circuit risk." };
  }
  if (price <= plan.stopLoss) {
    return { shouldExit: true, reason: "stop_loss_triggered", exitType: "FULL", newStatus: "EXIT_TRIGGERED", detail: `Stop hit @ ${price}.` };
  }
  if (price <= plan.invalidationLevel) {
    return { shouldExit: true, reason: "invalidation_break", exitType: "FULL", newStatus: "EXIT_TRIGGERED", detail: `Invalidation level broken.` };
  }
  if (!minHoldOk) {
    return { shouldExit: false, reason: null, exitType: "NONE", newStatus: "MONITOR", detail: "Within minimum holding period." };
  }
  if (price >= plan.takeProfit2) {
    return { shouldExit: true, reason: "take_profit_triggered", exitType: "FULL", newStatus: "EXIT_TRIGGERED", detail: "TP2 reached." };
  }
  if (plan.trailingActive && plan.trailingStop != null && price <= (plan.trailingStop as unknown as number)) {
    return { shouldExit: true, reason: "trailing_stop_triggered", exitType: "FULL", newStatus: "EXIT_TRIGGERED", detail: "Trailing stop triggered." };
  }
  if (price >= plan.takeProfit1) {
    return { shouldExit: false, reason: null, exitType: "PARTIAL", newStatus: "TP1_HIT", detail: "TP1 reached — activate trailing." };
  }
  if (price <= plan.stopLoss * 1.01) {
    return { shouldExit: false, reason: null, exitType: "NONE", newStatus: "NEAR_STOP", detail: "Near stop loss." };
  }
  if (price >= plan.takeProfit1 * 0.99) {
    return { shouldExit: false, reason: null, exitType: "NONE", newStatus: "NEAR_TP1", detail: "Approaching TP1." };
  }
  return { shouldExit: false, reason: null, exitType: "NONE", newStatus: "ACTIVE", detail: "Within plan." };
}

export function evaluateSwingTimeStop(
  pos: SwingPositionLike,
  plan: SwingPlan,
): SwingExitEvaluation {
  const ageDays = (Date.now() - new Date(pos.openedAt).getTime()) / SESSION_MS;
  const price = pos.lastPrice;
  const riskPerShare = Math.max(0.0001, plan.entryPrice - plan.stopLoss);
  const rMultiple = (price - plan.entryPrice) / riskPerShare;

  if (ageDays >= plan.maxHoldingDays) {
    // beyond absolute max — exit unless already trailing in strong profit
    if (rMultiple >= 1.5 && plan.trailingActive) {
      return { shouldExit: false, reason: null, exitType: "NONE", newStatus: "TRAILING_ACTIVE", detail: "Past max hold but trailing in profit." };
    }
    return { shouldExit: true, reason: "time_stop_triggered", exitType: "FULL", newStatus: "EXIT_TRIGGERED", detail: `Held ${ageDays.toFixed(1)}d >= max ${plan.maxHoldingDays}d.` };
  }
  if (ageDays >= 5 && rMultiple < 1) {
    return { shouldExit: true, reason: "time_stop_triggered", exitType: "FULL", newStatus: "EXIT_TRIGGERED", detail: `Day ${ageDays.toFixed(1)} with R<${rMultiple.toFixed(2)} — exit weak trade.` };
  }
  if (ageDays >= 3 && rMultiple < 0.5) {
    return { shouldExit: false, reason: null, exitType: "NONE", newStatus: "TIME_STOP_WARNING", detail: `Day ${ageDays.toFixed(1)} with R<${rMultiple.toFixed(2)} — warning.` };
  }
  return { shouldExit: false, reason: null, exitType: "NONE", newStatus: "ACTIVE", detail: "Time stop OK." };
}

export function evaluateSwingRisk(
  pos: SwingPositionLike,
  plan: SwingPlan,
  context: { drawdownPct?: number; consecutiveLosses?: number },
): { shouldReduce: boolean; reason: string | null } {
  if ((context.drawdownPct ?? 0) > 5) return { shouldReduce: true, reason: "portfolio_drawdown_>5pct" };
  if ((context.consecutiveLosses ?? 0) >= 3) return { shouldReduce: true, reason: "consec_losses_>=3" };
  return { shouldReduce: false, reason: null };
}
