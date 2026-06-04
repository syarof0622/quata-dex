// High-Conviction Swing Allocation engine (Patch add-on).
// PAPER TRADING ONLY. Pure logic — no DB, no I/O.
//
// Principle: "Trade less, allocate bigger only on validated high-conviction
// swing setups." Output a tier (0..3) + position size that combines
//   1) tier band (allocation % of equity)
//   2) risk-based sizing (riskAmount / stopDistance)
//   3) cash available
// and refuses tiny / weak / repeated-losing setups.

export type AllocationTier = 0 | 1 | 2 | 3;

export type RecoveryLevel = "normal" | "premium" | "L0" | "L1" | "L2";

export type AllocationInput = {
  equity: number;
  cashAvailable: number;
  price: number;
  qualityScore: number;          // 0..100 swing-quality score
  riskRewardRatio: number;       // RR vs TP2
  stopDistancePct: number;       // % of price (e.g. 3.5)
  recentLossCount?: number;      // for this symbol (rolling)
  recoveryLevel?: RecoveryLevel; // global portfolio mode
  protectionActive?: boolean;
  hasFullPlan?: boolean;         // SL/TP1/TP2/invalidation/RR present
};

export type AllocationDecision = {
  tier: AllocationTier;
  tierLabel: "REJECTED" | "STARTER" | "HIGH_CONVICTION" | "PREMIUM";
  allowed: boolean;
  blockedReason: string | null;
  allocationPct: number;         // 0..0.18 of equity
  allocationIDR: number;         // final IDR notional
  shares: number;                // multiple of 100 (IDX lot)
  lot: number;
  riskPerTradePct: number;       // 0.004..0.012
  riskAmountIDR: number;
  reasons: string[];
  warnings: string[];
  capExplain: string;            // which cap won (tier / risk / cash / floor)
};

// Tier bands per spec
const TIER_BAND: Record<AllocationTier, { min: number; max: number; mid: number; minRR: number; riskPct: number; }> = {
  0: { min: 0,    max: 0,    mid: 0,    minRR: 0,   riskPct: 0      },
  1: { min: 0.04, max: 0.06, mid: 0.05, minRR: 2.5, riskPct: 0.005  },
  2: { min: 0.08, max: 0.12, mid: 0.10, minRR: 2.8, riskPct: 0.0075 },
  3: { min: 0.12, max: 0.18, mid: 0.15, minRR: 2.8, riskPct: 0.010  },
};

// Recovery ladder — caps allocation pct & demands min score
const RECOVERY: Record<RecoveryLevel, { maxPct: number; minScore: number; targetExposure: [number, number]; }> = {
  L0:      { maxPct: 0.06, minScore: 90, targetExposure: [0.10, 0.20] },
  L1:      { maxPct: 0.10, minScore: 88, targetExposure: [0.20, 0.35] },
  L2:      { maxPct: 0.12, minScore: 85, targetExposure: [0.35, 0.50] },
  normal:  { maxPct: 0.15, minScore: 85, targetExposure: [0.45, 0.65] },
  premium: { maxPct: 0.18, minScore: 90, targetExposure: [0.60, 0.75] },
};

function pickTier(score: number, rr: number): AllocationTier {
  if (score < 85 || rr < 2.5) return 0;
  if (score >= 95) return 3;
  if (score >= 90) return rr >= 2.8 ? 2 : 1;
  return 1; // 85..89
}

export function computeHighConvictionAllocation(input: AllocationInput): AllocationDecision {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const recovery = input.recoveryLevel ?? "normal";
  const lvl = RECOVERY[recovery];

  const blocked = (reason: string): AllocationDecision => ({
    tier: 0, tierLabel: "REJECTED", allowed: false, blockedReason: reason,
    allocationPct: 0, allocationIDR: 0, shares: 0, lot: 0,
    riskPerTradePct: 0, riskAmountIDR: 0,
    reasons: [reason], warnings, capExplain: "blocked",
  });

  // Hard-gate sanity
  if (!input.hasFullPlan) return blocked("missing_full_trade_plan");
  if (!(input.equity > 0)) return blocked("equity_zero");
  if (!(input.price > 0)) return blocked("invalid_price");
  if (!(input.stopDistancePct >= 2.5 && input.stopDistancePct <= 6.5)) {
    return blocked(`stop_distance_out_of_band(${input.stopDistancePct.toFixed(2)}%)`);
  }

  // Losing-symbol guard
  const losses = Number(input.recentLossCount ?? 0);
  if (losses >= 3) return blocked("symbol_blocked_3_losses_manual_review");
  if (losses === 2) return blocked("symbol_cooldown_2_losses_10d");

  // Recovery-level minimum score
  if (input.qualityScore < lvl.minScore) {
    return blocked(`score_${input.qualityScore}_below_recovery_min_${lvl.minScore}`);
  }

  // Tier selection
  let tier = pickTier(input.qualityScore, input.riskRewardRatio);
  // 1 recent loss: max allocation 4%, require score >= 92
  if (losses === 1) {
    if (input.qualityScore < 92) return blocked("recent_loss_requires_score>=92");
    tier = (tier > 1 ? 1 : tier);
    reasons.push("recent_loss_caps_tier_to_starter_4pct");
  }
  if (tier === 0) return blocked(`tier_0_score_${input.qualityScore}_rr_${input.riskRewardRatio.toFixed(2)}`);

  const band = TIER_BAND[tier];
  if (input.riskRewardRatio < band.minRR) {
    return blocked(`rr_${input.riskRewardRatio.toFixed(2)}_below_tier_${tier}_min_${band.minRR}`);
  }

  // Allocation pct: midpoint, clamped by recovery ladder & loss cap
  let allocPct = band.mid;
  if (losses === 1) allocPct = Math.min(allocPct, 0.04);
  if (input.protectionActive) {
    allocPct = Math.min(allocPct, 0.06);
    reasons.push("protection_mode_caps_alloc_6pct");
  }
  const ladderCap = lvl.maxPct;
  if (allocPct > ladderCap) {
    allocPct = ladderCap;
    reasons.push(`recovery_${recovery}_caps_alloc_${(ladderCap * 100).toFixed(0)}pct`);
  }

  const equity = input.equity;
  const targetIDR = equity * allocPct;
  const riskPct = band.riskPct;
  const riskAmount = equity * riskPct;
  const riskBasedIDR = (riskAmount / (input.stopDistancePct / 100));

  // Final = min of three caps
  const caps: { name: string; v: number }[] = [
    { name: "tier_allocation", v: targetIDR },
    { name: "risk_per_trade",  v: riskBasedIDR },
    { name: "cash_available",  v: Math.max(0, input.cashAvailable) },
  ];
  const winner = caps.reduce((a, b) => (b.v < a.v ? b : a));
  let finalIDR = Math.max(0, winner.v);

  // Floor: no tiny positions. Minimum 4% equity for any Swing Max trade.
  const minMeaningful = equity * 0.04;
  if (finalIDR < minMeaningful) {
    // If we can safely raise (risk + cash allow), do so; otherwise block.
    const canRaise = riskBasedIDR >= minMeaningful && input.cashAvailable >= minMeaningful;
    if (!canRaise) {
      return blocked(`position_below_4pct_floor(${(finalIDR / equity * 100).toFixed(2)}%)`);
    }
    finalIDR = minMeaningful;
    reasons.push("raised_to_4pct_floor");
  }

  // Lot conversion (IDX = 100 shares / lot)
  let shares = Math.floor(finalIDR / input.price / 100) * 100;
  if (shares < 100) return blocked("position_below_1_lot_after_lot_rounding");
  let lot = shares / 100;
  finalIDR = shares * input.price;

  reasons.push(`tier_${tier}_${tier === 1 ? "starter" : tier === 2 ? "high_conviction" : "premium"}`);
  reasons.push(`cap_winner_${winner.name}`);

  const tierLabel: AllocationDecision["tierLabel"] =
    tier === 1 ? "STARTER" : tier === 2 ? "HIGH_CONVICTION" : "PREMIUM";

  return {
    tier, tierLabel, allowed: true, blockedReason: null,
    allocationPct: +(finalIDR / equity).toFixed(4),
    allocationIDR: Math.round(finalIDR),
    shares, lot,
    riskPerTradePct: riskPct,
    riskAmountIDR: Math.round(riskAmount),
    reasons, warnings, capExplain: winner.name,
  };
}

// Human-readable one-liner used by reasoning + UI
export function explainAllocation(symbol: string, d: AllocationDecision): string {
  if (!d.allowed) return `${symbol} REJECTED: ${d.blockedReason}.`;
  return `${symbol} ${d.tierLabel} tier ${d.tier}: alloc ${(d.allocationPct * 100).toFixed(1)}% (${d.allocationIDR.toLocaleString()} IDR, ${d.lot} lot), risk ${(d.riskPerTradePct * 100).toFixed(2)}%/trade, cap=${d.capExplain}.`;
}
