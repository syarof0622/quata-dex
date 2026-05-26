// Strategy Intelligence — registry, regime/sector compatibility, score
// computation, plus server fns for recording forward-test outcomes and
// surfacing performance to UI + AI Analyst.
//
// All trading is paper-only. Forward-test rows come exclusively from
// closed paper trades; backtest rows are populated by runBacktest.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ---------------- Registry ----------------

export type StrategyName =
  | "momentum_breakout"
  | "pullback_to_support"
  | "trend_following"
  | "mean_reversion"
  | "sector_rotation"
  | "defensive_rotation"
  | "dividend_momentum"
  | "undervalue_reversal"
  | "news_catalyst"
  | "risk_off_cash_preservation";

export const STRATEGY_REGISTRY: { name: StrategyName; setupType: string; description: string }[] = [
  { name: "momentum_breakout",          setupType: "breakout",          description: "Break above resistance with rising volume." },
  { name: "pullback_to_support",        setupType: "pullback",          description: "Buy retracements into structural support in an uptrend." },
  { name: "trend_following",            setupType: "trend",             description: "Ride established trend via MA / EMA alignment." },
  { name: "mean_reversion",             setupType: "reversal",          description: "Fade short-term extremes back toward the mean." },
  { name: "sector_rotation",            setupType: "rotation",          description: "Allocate into sectors rotating in / leading the tape." },
  { name: "defensive_rotation",         setupType: "defensive",         description: "Rotate into low-beta / defensive names in risk-off." },
  { name: "dividend_momentum",          setupType: "income",            description: "Income-focused names with stable dividend momentum." },
  { name: "undervalue_reversal",        setupType: "value",             description: "Fundamentally undervalued with technical turn." },
  { name: "news_catalyst",              setupType: "event",             description: "Tradeable reaction to a confirmed news catalyst." },
  { name: "risk_off_cash_preservation", setupType: "cash",              description: "Stay in cash / minimise exposure in adverse regime." },
];

// Market-regime compatibility (0..1). Used both to gate AI Agent and to
// rank strategies for AI Analyst answers.
export type Regime = "risk_off" | "risk_on" | "neutral" | "transition" | "bullish" | "high_volatility" | "unknown";

const REGIME_COMPAT: Record<StrategyName, Partial<Record<Regime, number>>> = {
  momentum_breakout:          { risk_on: 0.95, bullish: 0.9, neutral: 0.6, transition: 0.45, risk_off: 0.15, high_volatility: 0.35 },
  pullback_to_support:        { risk_on: 0.85, bullish: 0.85, neutral: 0.8, transition: 0.6, risk_off: 0.35, high_volatility: 0.5 },
  trend_following:            { risk_on: 0.9, bullish: 0.95, neutral: 0.6, transition: 0.4, risk_off: 0.25, high_volatility: 0.35 },
  mean_reversion:             { risk_on: 0.6, bullish: 0.55, neutral: 0.75, transition: 0.7, risk_off: 0.55, high_volatility: 0.7 },
  sector_rotation:            { risk_on: 0.8, bullish: 0.8, neutral: 0.8, transition: 0.75, risk_off: 0.6, high_volatility: 0.55 },
  defensive_rotation:         { risk_on: 0.45, bullish: 0.4, neutral: 0.7, transition: 0.8, risk_off: 0.95, high_volatility: 0.85 },
  dividend_momentum:          { risk_on: 0.65, bullish: 0.65, neutral: 0.8, transition: 0.75, risk_off: 0.75, high_volatility: 0.7 },
  undervalue_reversal:        { risk_on: 0.7, bullish: 0.7, neutral: 0.85, transition: 0.75, risk_off: 0.65, high_volatility: 0.55 },
  news_catalyst:              { risk_on: 0.75, bullish: 0.75, neutral: 0.7, transition: 0.65, risk_off: 0.5, high_volatility: 0.55 },
  risk_off_cash_preservation: { risk_on: 0.2, bullish: 0.15, neutral: 0.45, transition: 0.7, risk_off: 1.0, high_volatility: 0.9 },
};

export function regimeCompatibility(strategy: StrategyName | string, regime: Regime | string | null | undefined): number {
  const s = String(strategy) as StrategyName;
  const r = String(regime || "unknown") as Regime;
  const row = REGIME_COMPAT[s];
  if (!row) return 0.5;
  return row[r] ?? 0.55;
}

// Heuristic sector compatibility — defensive vs cyclical / value vs growth.
const SECTOR_COMPAT: Record<StrategyName, Partial<Record<string, number>>> = {
  momentum_breakout:          { Tech: 0.9, Consumer: 0.7, Financials: 0.7, Energy: 0.7, Materials: 0.65, Industrials: 0.7, Healthcare: 0.6, Telecom: 0.55, "Real Estate": 0.5, Utilities: 0.4 },
  defensive_rotation:         { Utilities: 0.95, Telecom: 0.85, Consumer: 0.8, Healthcare: 0.85, Financials: 0.5, Energy: 0.4, Tech: 0.35, Materials: 0.4 },
  trend_following:            { Tech: 0.85, Financials: 0.75, Energy: 0.7, Consumer: 0.7 },
  pullback_to_support:        { Tech: 0.75, Financials: 0.75, Consumer: 0.75 },
  mean_reversion:             { Energy: 0.7, Materials: 0.7, Tech: 0.55 },
  sector_rotation:            {},
  dividend_momentum:          { Utilities: 0.85, Telecom: 0.8, Financials: 0.75, Consumer: 0.7 },
  undervalue_reversal:        { Financials: 0.8, Energy: 0.75, Materials: 0.7, Telecom: 0.7 },
  news_catalyst:              {},
  risk_off_cash_preservation: {},
};

export function sectorCompatibility(strategy: StrategyName | string, sector: string | null | undefined): number {
  const row = SECTOR_COMPAT[strategy as StrategyName];
  if (!row || !sector) return 0.6;
  return row[sector] ?? 0.6;
}

// ---------------- Strategy score ----------------

export type StrategyClassification =
  | "proven" | "promising" | "insufficient_sample" | "unstable" | "underperforming" | "avoid";

export type StrategyScore = {
  strategyName: string;
  strategyScore: number; // 0..100
  classification: StrategyClassification;
  sampleQuality: "insufficient_sample" | "small" | "valid";
  backtestWinRate: number | null;
  forwardWinRate: number | null;
  avgReturn: number | null;
  profitFactor: number | null;
  maxDrawdown: number | null;
  sampleSize: number;
  warnings: string[];
};

function classify(score: number, sample: number, drawdown: number, winRate: number | null): StrategyClassification {
  if (sample < 5) return "insufficient_sample";
  if (drawdown > 25) return "unstable";
  if (winRate != null && winRate < 35) return "underperforming";
  if (score >= 75 && sample >= 20) return "proven";
  if (score >= 60) return "promising";
  if (score <= 35) return "avoid";
  return "promising";
}

function clamp01(n: number) { return Math.max(0, Math.min(1, n)); }

export function computeStrategyScore(input: {
  strategyName: string;
  backtest?: { trades: number; winRate: number; avgReturn: number; profitFactor: number; maxDrawdown: number };
  forward?:  { trades: number; winRate: number; avgReturn: number; profitFactor: number };
  regime?: string | null;
  sector?: string | null;
}): StrategyScore {
  const bt = input.backtest;
  const ft = input.forward;
  const totalSample = (bt?.trades ?? 0) + (ft?.trades ?? 0);
  const winRate = ft?.winRate ?? bt?.winRate ?? null;
  const avgReturn = ft?.avgReturn ?? bt?.avgReturn ?? null;
  const profitFactor = ft?.profitFactor ?? bt?.profitFactor ?? null;
  const drawdown = bt?.maxDrawdown ?? 0;
  const warnings: string[] = [];

  // Component subscores in 0..1.
  const wWin   = winRate != null ? clamp01(winRate / 100) : 0.4;
  const wRet   = avgReturn != null ? clamp01((avgReturn + 5) / 15) : 0.4;
  const wPf    = profitFactor != null ? clamp01(profitFactor / 3) : 0.4;
  const wDD    = clamp01(1 - drawdown / 30);
  const wSamp  = clamp01(totalSample / 30);
  const regimeC = regimeCompatibility(input.strategyName, (input.regime ?? "unknown") as Regime);
  const sectorC = sectorCompatibility(input.strategyName, input.sector ?? null);

  // Weighted blend.
  const raw = wWin * 0.25 + wRet * 0.15 + wPf * 0.15 + wDD * 0.10
            + wSamp * 0.10 + regimeC * 0.15 + sectorC * 0.10;
  const score = Math.round(raw * 100);

  if (totalSample < 5) warnings.push("Sample size kecil — kesimpulan belum kuat.");
  if (drawdown > 25) warnings.push(`Max drawdown ${drawdown.toFixed(1)}% — strategi tidak stabil.`);
  if (winRate != null && winRate < 35) warnings.push("Win rate rendah — under-performing.");

  const sampleQuality: StrategyScore["sampleQuality"] =
    totalSample < 5 ? "insufficient_sample" : totalSample < 20 ? "small" : "valid";

  return {
    strategyName: input.strategyName,
    strategyScore: score,
    classification: classify(score, totalSample, drawdown, winRate),
    sampleQuality,
    backtestWinRate: bt?.winRate ?? null,
    forwardWinRate: ft?.winRate ?? null,
    avgReturn, profitFactor, maxDrawdown: drawdown,
    sampleSize: totalSample,
    warnings,
  };
}

// ---------------- Aggregation helpers ----------------

async function aggregateBacktest(strategyName: string, opts?: { regime?: string; sector?: string }) {
  let q = supabaseAdmin.from("strategy_backtest_results")
    .select("total_trades, win_rate, avg_return, profit_factor, max_drawdown, market_regime, sector")
    .eq("strategy_name", strategyName);
  if (opts?.regime) q = q.eq("market_regime", opts.regime);
  if (opts?.sector) q = q.eq("sector", opts.sector);
  const { data } = await q.limit(50);
  const rows = data ?? [];
  if (rows.length === 0) return null;
  const trades = rows.reduce((s, r: any) => s + Number(r.total_trades ?? 0), 0);
  const wWin = rows.reduce((s, r: any) => s + Number(r.win_rate ?? 0) * Number(r.total_trades ?? 0), 0);
  const wRet = rows.reduce((s, r: any) => s + Number(r.avg_return ?? 0) * Number(r.total_trades ?? 0), 0);
  const wPf  = rows.reduce((s, r: any) => s + Number(r.profit_factor ?? 0) * Number(r.total_trades ?? 0), 0);
  const dd   = Math.max(0, ...rows.map((r: any) => Number(r.max_drawdown ?? 0)));
  return {
    trades,
    winRate: trades ? wWin / trades : 0,
    avgReturn: trades ? wRet / trades : 0,
    profitFactor: trades ? wPf / trades : 0,
    maxDrawdown: dd,
  };
}

async function aggregateForward(strategyName: string, opts?: { regime?: string; sector?: string }) {
  let q = supabaseAdmin.from("strategy_forward_test_results")
    .select("realized_pnl, realized_pnl_pct, result, sector, market_regime")
    .eq("strategy_name", strategyName);
  if (opts?.regime) q = q.eq("market_regime", opts.regime);
  if (opts?.sector) q = q.eq("sector", opts.sector);
  const { data } = await q.limit(500);
  const rows = (data ?? []).filter((r: any) => r.result === "win" || r.result === "loss" || r.result === "breakeven");
  if (rows.length === 0) return null;
  const wins = rows.filter((r: any) => r.result === "win").length;
  const grossWin = rows.filter((r: any) => Number(r.realized_pnl) > 0).reduce((s, r: any) => s + Number(r.realized_pnl), 0);
  const grossLoss = Math.abs(rows.filter((r: any) => Number(r.realized_pnl) < 0).reduce((s, r: any) => s + Number(r.realized_pnl), 0));
  const avgPct = rows.reduce((s, r: any) => s + Number(r.realized_pnl_pct ?? 0), 0) / rows.length;
  return {
    trades: rows.length,
    winRate: (wins / rows.length) * 100,
    avgReturn: avgPct,
    profitFactor: grossLoss ? grossWin / grossLoss : grossWin > 0 ? 99 : 0,
  };
}

// Public helper consumed by the AI Trade Agent decision engine.
export async function getStrategyContextFor(input: {
  strategyName: string; sector?: string | null; regime?: string | null;
}): Promise<StrategyScore & { regimeCompatibility: number; sectorCompatibility: number; warningsList: string[] }> {
  const [bt, ft] = await Promise.all([
    aggregateBacktest(input.strategyName, { regime: input.regime ?? undefined, sector: input.sector ?? undefined }),
    aggregateForward(input.strategyName, { regime: input.regime ?? undefined, sector: input.sector ?? undefined }),
  ]);
  const score = computeStrategyScore({
    strategyName: input.strategyName,
    backtest: bt ?? undefined, forward: ft ?? undefined,
    regime: input.regime ?? null, sector: input.sector ?? null,
  });
  const regimeC = regimeCompatibility(input.strategyName, (input.regime ?? "unknown") as Regime);
  const sectorC = sectorCompatibility(input.strategyName, input.sector ?? null);
  return { ...score, regimeCompatibility: regimeC, sectorCompatibility: sectorC, warningsList: score.warnings };
}

// ---------------- Forward-test ingestion ----------------
// Called from post-trade review: ONLY closed paper trades feed forward test.

export async function recordForwardTestFromClosedTrade(input: {
  paperOrderId: string;
  trainingEventId?: string | null;
  symbol: string;
  sector?: string | null;
  strategyName?: string | null;
  marketRegime?: string | null;
  realizedPnl: number | null;
  realizedPnlPct: number | null;
  holdingMinutes?: number | null;
  closeReason?: string | null;
}) {
  if (input.realizedPnl == null) return { skipped: true, reason: "no_realized_pnl" };
  const strategy = input.strategyName && input.strategyName.length > 0 ? input.strategyName : "unspecified_strategy";
  const result = input.realizedPnl > 0 ? "win" : input.realizedPnl < 0 ? "loss" : "breakeven";
  const { error } = await supabaseAdmin.from("strategy_forward_test_results").upsert({
    paper_order_id: input.paperOrderId,
    training_event_id: input.trainingEventId ?? null,
    symbol: input.symbol,
    sector: input.sector ?? null,
    strategy_name: strategy,
    market_regime: input.marketRegime ?? null,
    realized_pnl: input.realizedPnl,
    realized_pnl_pct: input.realizedPnlPct ?? null,
    holding_duration_minutes: input.holdingMinutes ?? null,
    result,
    close_reason: input.closeReason ?? null,
  }, { onConflict: "paper_order_id" });
  return { ok: !error, error: error?.message ?? null };
}

// ---------------- Server fns for UI + chat ----------------

export const listStrategyPerformance = createServerFn({ method: "GET" })
  .inputValidator((d: { regime?: string; sector?: string } = {}) =>
    z.object({
      regime: z.string().optional(),
      sector: z.string().optional(),
    }).parse(d ?? {}))
  .handler(async ({ data }) => {
    const out: StrategyScore[] = [];
    for (const s of STRATEGY_REGISTRY) {
      const bt = await aggregateBacktest(s.name, data);
      const ft = await aggregateForward(s.name, data);
      out.push(computeStrategyScore({
        strategyName: s.name, backtest: bt ?? undefined, forward: ft ?? undefined,
        regime: data.regime ?? null, sector: data.sector ?? null,
      }));
    }
    return out.sort((a, b) => b.strategyScore - a.strategyScore);
  });

// Internal helper — used by getStrategyIntelligence and by ai-app-context
// (which can't easily call a serverFn from inside another serverFn handler).
export async function buildStrategyIntelligence() {
  const { data: regimeRow } = await supabaseAdmin
    .from("market_regime_snapshots")
    .select("regime_classification, regime_volatility")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  const regime = (regimeRow as any)?.regime_classification ?? "unknown";

  const all: StrategyScore[] = [];
  for (const s of STRATEGY_REGISTRY) {
    const bt = await aggregateBacktest(s.name, { regime });
    const ft = await aggregateForward(s.name, { regime });
    all.push(computeStrategyScore({
      strategyName: s.name, backtest: bt ?? undefined, forward: ft ?? undefined,
      regime,
    }));
  }
  const ranked = [...all].sort((a, b) => b.strategyScore - a.strategyScore);
  const proven      = ranked.filter(s => s.classification === "proven");
  const promising   = ranked.filter(s => s.classification === "promising");
  const insufficient = ranked.filter(s => s.classification === "insufficient_sample");
  const avoid       = ranked.filter(s => s.classification === "avoid" || s.classification === "underperforming");

  return {
    marketRegime: regime,
    bestForThisRegime: ranked.slice(0, 3),
    avoidForThisRegime: avoid.slice(0, 3),
    proven, promising, insufficient,
    generatedAt: new Date().toISOString(),
  };
}

export const getStrategyIntelligence = createServerFn({ method: "GET" })
  .handler(async () => buildStrategyIntelligence());

