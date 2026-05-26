// Pure math helpers for portfolio attribution, scenarios, cash drag, what-if.
// No I/O — safe to import from anywhere.

import type { Sector } from "./sectors";
import { sectorOf } from "./sectors";

/**
 * Long-term sector beta priors vs IHSG, used as fallback when we cannot
 * compute a real per-symbol beta from candles. These are rough heuristics —
 * we always mark fallback with confidence "low".
 */
export const SECTOR_BETA_PRIOR: Record<Sector, number> = {
  Financials: 1.2,
  Telecom: 0.7,
  Consumer: 0.8,
  Energy: 1.3,
  Materials: 1.4,
  Industrials: 1.1,
  Tech: 1.3,
  Healthcare: 0.7,
  RealEstate: 1.0,
  Utilities: 0.5,
  Other: 1.0,
};

/** Subjective "macro risk" rank per sector — used when beta is unavailable. */
export const SECTOR_RISK_RANK: Record<Sector, "low" | "moderate" | "elevated" | "high"> = {
  Utilities: "low",
  Healthcare: "low",
  Telecom: "low",
  Consumer: "moderate",
  Financials: "moderate",
  Industrials: "moderate",
  RealEstate: "moderate",
  Tech: "elevated",
  Energy: "elevated",
  Materials: "high",
  Other: "moderate",
};

export function betaFromReturns(assetReturns: number[], benchReturns: number[]): number | null {
  const n = Math.min(assetReturns.length, benchReturns.length);
  if (n < 30) return null;
  const a = assetReturns.slice(-n);
  const b = benchReturns.slice(-n);
  const meanA = a.reduce((s, v) => s + v, 0) / n;
  const meanB = b.reduce((s, v) => s + v, 0) / n;
  let cov = 0, varB = 0;
  for (let i = 0; i < n; i++) {
    cov += (a[i] - meanA) * (b[i] - meanB);
    varB += (b[i] - meanB) ** 2;
  }
  return varB > 0 ? cov / varB : null;
}

/** Annualised volatility (stdev × √252) from last ~60 daily returns. */
export function annualizedVol(returns: number[], lookback = 60): number | null {
  if (returns.length < 20) return null;
  const r = returns.slice(-lookback);
  const mean = r.reduce((s, v) => s + v, 0) / r.length;
  const variance = r.reduce((s, v) => s + (v - mean) ** 2, 0) / r.length;
  return Math.sqrt(variance) * Math.sqrt(252) * 100; // pct
}

export type AttribPosition = {
  symbol: string;
  sector: Sector;
  marketValue: number;
  weight: number;            // % of equity
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  contributionToReturn: number; // pnl / initialBalance * 100
  contributionToRisk: number;   // relative %, sums to ~100 across positions
  beta: number | null;
  betaSource: "computed" | "sector_prior";
  volatility: number | null;    // annualised %
};

export type SectorAttribution = {
  sector: Sector;
  totalMarketValue: number;
  sectorWeight: number;          // % of equity
  sectorUnrealizedPnl: number;
  sectorContribution: number;    // % of initialBalance
  sectorRiskLevel: "low" | "moderate" | "elevated" | "high";
  positionCount: number;
};

export type ScenarioResult = {
  scenario: string;
  benchmarkShockPct: number;
  estimatedPortfolioChangePct: number;
  estimatedPortfolioChange: number;
  estimatedEquity: number;
  worstContributor: { symbol: string; impact: number } | null;
  bestContributor: { symbol: string; impact: number } | null;
  confidence: "high" | "medium" | "low";
  riskNotes: string[];
};

export function computeSectorAttribution(
  positions: AttribPosition[],
  equity: number,
  initialBalance: number,
): SectorAttribution[] {
  const map = new Map<Sector, SectorAttribution>();
  for (const p of positions) {
    const sec = p.sector;
    const cur = map.get(sec) ?? {
      sector: sec,
      totalMarketValue: 0,
      sectorWeight: 0,
      sectorUnrealizedPnl: 0,
      sectorContribution: 0,
      sectorRiskLevel: SECTOR_RISK_RANK[sec] ?? "moderate",
      positionCount: 0,
    };
    cur.totalMarketValue += p.marketValue;
    cur.sectorUnrealizedPnl += p.unrealizedPnl;
    cur.positionCount += 1;
    map.set(sec, cur);
  }
  const out: SectorAttribution[] = [];
  for (const s of map.values()) {
    s.sectorWeight = equity > 0 ? (s.totalMarketValue / equity) * 100 : 0;
    s.sectorContribution = initialBalance > 0 ? (s.sectorUnrealizedPnl / initialBalance) * 100 : 0;
    out.push(s);
  }
  out.sort((a, b) => b.totalMarketValue - a.totalMarketValue);
  return out;
}

export function computeCashDrag(opts: {
  cash: number;
  equity: number;
  benchReturns: number[];   // daily returns of benchmark
  lookbackDays?: number;
}): {
  cashRatio: number;
  benchmarkPeriodReturnPct: number | null;
  cashDragEstimate: number;       // hypothetical extra P/L if cash had been invested at bench
  lookbackDays: number;
  note: string;
} {
  const lookback = opts.lookbackDays ?? 60;
  const r = opts.benchReturns.slice(-lookback);
  const cashRatio = opts.equity > 0 ? (opts.cash / opts.equity) * 100 : 100;
  if (r.length < 10) {
    return {
      cashRatio,
      benchmarkPeriodReturnPct: null,
      cashDragEstimate: 0,
      lookbackDays: r.length,
      note: "Benchmark history insufficient to estimate cash drag.",
    };
  }
  // Compound return over lookback period
  let factor = 1;
  for (const v of r) factor *= 1 + v;
  const periodReturnPct = (factor - 1) * 100;
  const cashDragEstimate = opts.cash * (factor - 1);
  const note =
    periodReturnPct > 2
      ? "Pasar bullish: cash besar berpotensi menjadi drag terhadap return."
      : periodReturnPct < -2
      ? "Pasar risk-off: cash bertindak sebagai pelindung dari drawdown."
      : "Pasar sideways: dampak cash terhadap return relatif kecil.";
  return { cashRatio, benchmarkPeriodReturnPct: periodReturnPct, cashDragEstimate, lookbackDays: r.length, note };
}

export function computeScenarios(opts: {
  positions: AttribPosition[];
  equity: number;
  shocks?: number[]; // pct, negative for downside
}): ScenarioResult[] {
  const shocks = opts.shocks ?? [-2, -5, -10];
  const real = opts.positions.filter((p) => p.betaSource === "computed").length;
  const total = opts.positions.length;
  const confidence: ScenarioResult["confidence"] =
    total === 0 ? "low" : real / total >= 0.7 ? "high" : real / total >= 0.3 ? "medium" : "low";

  return shocks.map((shock) => {
    let estChangePct = 0;
    let worst: { symbol: string; impact: number } | null = null;
    let best: { symbol: string; impact: number } | null = null;
    for (const p of opts.positions) {
      const beta = p.beta ?? SECTOR_BETA_PRIOR[p.sector] ?? 1;
      const impactPct = (p.weight / 100) * beta * shock; // % of equity
      const impactValue = (impactPct / 100) * opts.equity;
      estChangePct += impactPct;
      if (!worst || impactValue < worst.impact) worst = { symbol: p.symbol, impact: impactValue };
      if (!best || impactValue > best.impact) best = { symbol: p.symbol, impact: impactValue };
    }
    const estChange = (estChangePct / 100) * opts.equity;
    const notes: string[] = [];
    if (confidence === "low") notes.push("Beta data terbatas — estimasi memakai sektor prior.");
    if (total === 0) notes.push("Tidak ada open position; equity hampir tidak terpengaruh shock pasar.");
    if (shock <= -10) notes.push("Skenario stress: korelasi sektor bisa naik (risiko sistemik).");
    return {
      scenario: `IHSG ${shock > 0 ? "+" : ""}${shock}%`,
      benchmarkShockPct: shock,
      estimatedPortfolioChangePct: estChangePct,
      estimatedPortfolioChange: estChange,
      estimatedEquity: opts.equity + estChange,
      worstContributor: total > 0 ? worst : null,
      bestContributor: total > 0 ? best : null,
      confidence,
      riskNotes: notes,
    };
  });
}

export type WhatIfClose = {
  type: "close_position";
  symbol: string;
  currentMarketValue: number;
  newCash: number;
  newExposurePct: number;
  newSectorExposurePct: Record<string, number>;
  realizedPnlIfClosedNow: number;
  notes: string[];
};

export type WhatIfAdd = {
  type: "add_position";
  symbol: string;
  sector: Sector;
  estCost: number;
  newCash: number;
  newExposurePct: number;
  newSectorExposurePct: Record<string, number>;
  affordable: boolean;
  notes: string[];
};

export function simulateClose(opts: {
  positions: AttribPosition[];
  cash: number;
  equity: number;
  symbol: string;
}): WhatIfClose | { error: string } {
  const pos = opts.positions.find((p) => p.symbol === opts.symbol);
  if (!pos) return { error: `Position ${opts.symbol} tidak ditemukan.` };
  const newCash = opts.cash + pos.marketValue;
  const remaining = opts.positions.filter((p) => p.symbol !== opts.symbol);
  const newHoldings = remaining.reduce((s, p) => s + p.marketValue, 0);
  const newEquity = newCash + newHoldings; // equity invariant under paper close
  const newExposurePct = newEquity > 0 ? (newHoldings / newEquity) * 100 : 0;
  const sectorMap: Record<string, number> = {};
  for (const p of remaining) sectorMap[p.sector] = (sectorMap[p.sector] ?? 0) + p.marketValue;
  const newSectorExposurePct: Record<string, number> = {};
  for (const [k, v] of Object.entries(sectorMap)) {
    newSectorExposurePct[k] = newEquity > 0 ? (v / newEquity) * 100 : 0;
  }
  const notes: string[] = [];
  if (remaining.length === 0) notes.push("Setelah close, portfolio akan 100% cash.");
  if (pos.unrealizedPnl < 0) notes.push("Posisi ditutup pada kerugian — pertimbangkan tesis vs strategi exit.");
  return {
    type: "close_position",
    symbol: opts.symbol,
    currentMarketValue: pos.marketValue,
    newCash,
    newExposurePct,
    newSectorExposurePct,
    realizedPnlIfClosedNow: pos.unrealizedPnl,
    notes,
  };
}

export function simulateAdd(opts: {
  positions: AttribPosition[];
  cash: number;
  equity: number;
  symbol: string;
  lot: number;
  price: number;
}): WhatIfAdd | { error: string } {
  if (!opts.price || opts.price <= 0) return { error: "Harga tidak valid." };
  if (!opts.lot || opts.lot <= 0) return { error: "Lot harus > 0." };
  const sector = sectorOf(opts.symbol);
  const shares = opts.lot * 100;
  const estCost = shares * opts.price;
  const affordable = estCost <= opts.cash;
  const newCash = Math.max(0, opts.cash - estCost);
  const sectorMap: Record<string, number> = {};
  for (const p of opts.positions) sectorMap[p.sector] = (sectorMap[p.sector] ?? 0) + p.marketValue;
  sectorMap[sector] = (sectorMap[sector] ?? 0) + estCost;
  const newHoldings = opts.positions.reduce((s, p) => s + p.marketValue, 0) + estCost;
  const newEquity = newCash + newHoldings;
  const newExposurePct = newEquity > 0 ? (newHoldings / newEquity) * 100 : 0;
  const newSectorExposurePct: Record<string, number> = {};
  for (const [k, v] of Object.entries(sectorMap)) {
    newSectorExposurePct[k] = newEquity > 0 ? (v / newEquity) * 100 : 0;
  }
  const notes: string[] = [];
  if (!affordable) notes.push(`Cash tidak cukup: butuh ${estCost.toLocaleString()}, tersedia ${opts.cash.toLocaleString()}.`);
  if (newExposurePct > 80) notes.push("Exposure akan > 80% — cash buffer rendah.");
  if ((newSectorExposurePct[sector] ?? 0) > 40) notes.push(`Sektor ${sector} akan melewati 40% — risk konsentrasi sektor.`);
  return {
    type: "add_position",
    symbol: opts.symbol,
    sector,
    estCost,
    newCash,
    newExposurePct,
    newSectorExposurePct,
    affordable,
    notes,
  };
}
