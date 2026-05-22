// AI Momentum Hunter — Top Gainer Capture (Modules 1–3, 6, 8, 11)
// Server-only helpers: detect today's strong movers, score each candidate
// across momentum dimensions, classify into action buckets, and produce
// Indonesian-language reasoning. NO database writes here — pure functions
// over Quote + optional history/news context. Used by the autonomous
// scanner and by `momentum-hunter.functions.ts` for the UI panel.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getQuotes, type Quote } from "./market.functions";
import { IDX_LQ45 } from "./symbols";

export type MomentumClassification =
  | "strong_momentum_candidate"
  | "early_momentum_candidate"
  | "extended_momentum_risk"
  | "failed_momentum"
  | "watch_only";

export type MomentumScore = {
  symbol: string;
  todayChangePercent: number;
  relativeVolume: number;
  volume: number;
  price: number | null;
  prevClose: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  // sub-scores (0..100 each, except riskPenalty which is 0..100 subtracted)
  changeScore: number;
  rvolScore: number;
  breakoutScore: number;
  trendScore: number;
  catalystScore: number;
  liquidityScore: number;
  riskPenalty: number;
  momentumScore: number;
  classification: MomentumClassification;
  reason: string;
  catalystSummary: string | null;
  warnings: string[];
};

export type MomentumInputs = {
  /** Optional override: typical daily volume to compute RVOL. */
  avgVolume?: number | null;
  /** Optional: news/catalyst count in last 24h for the symbol. */
  catalystCount?: number;
  /** Optional: aggregate sentiment in [-1, 1]. */
  catalystSentiment?: number | null;
  /** Optional: short note about the catalyst (e.g. "Earnings beat"). */
  catalystSummary?: string | null;
  /** Optional: high impact disclosure flag — adds risk if true & negative. */
  hasNegativeDisclosure?: boolean;
  /** Optional: stock flagged UMA / suspended. */
  isRestricted?: boolean;
};

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

function scoreChange(changePct: number): number {
  const a = Math.abs(changePct);
  if (a >= 20) return 100;
  if (a >= 10) return 85;
  if (a >= 5) return 70;
  if (a >= 3) return 55;
  if (a >= 1.5) return 35;
  return 15;
}

function scoreRvol(rvol: number): number {
  if (!isFinite(rvol) || rvol <= 0) return 30;
  if (rvol >= 3) return 100;
  if (rvol >= 2) return 85;
  if (rvol >= 1.5) return 70;
  if (rvol >= 1.2) return 55;
  if (rvol >= 1) return 40;
  return 25;
}

function scoreBreakout(q: Quote): number {
  const price = Number(q.price ?? 0);
  const high = Number(q.high ?? 0);
  const prev = Number(q.prevClose ?? 0);
  if (!price) return 30;
  let s = 40;
  // Breaking intraday high
  if (high && price >= high * 0.998) s += 25;
  // Above prev close (gap up / breakout)
  if (prev && price > prev * 1.02) s += 20;
  if (prev && price > prev * 1.05) s += 10;
  return clamp(s);
}

function scoreTrend(q: Quote): number {
  const price = Number(q.price ?? 0);
  const open = Number(q.open ?? 0);
  const low = Number(q.low ?? 0);
  const high = Number(q.high ?? 0);
  if (!price || !open || !high || !low) return 50;
  // Closing near high of day = sustained
  const range = Math.max(1e-6, high - low);
  const closeLocation = (price - low) / range; // 0 (at low) .. 1 (at high)
  let s = 30 + closeLocation * 60;
  // Held above open
  if (price >= open) s += 5;
  return clamp(s);
}

function scoreLiquidity(volume: number, price: number | null): number {
  const value = volume * (price ?? 0);
  if (value >= 50e9) return 95; // IDR
  if (value >= 10e9) return 85;
  if (value >= 2e9) return 70;
  if (value >= 500e6) return 55;
  if (value >= 100e6) return 40;
  return 20;
}

function scoreCatalyst(count: number, sentiment: number | null): number {
  if (count <= 0) return 30;
  const sent = Number(sentiment ?? 0);
  let s = 40 + Math.min(30, count * 8);
  if (sent > 0.2) s += 20;
  else if (sent < -0.2) s -= 25;
  return clamp(s);
}

function computeRiskPenalty(args: {
  changePct: number;
  rvol: number;
  liquidity: number;
  hasNegativeDisclosure?: boolean;
  isRestricted?: boolean;
  closeLocation: number;
}): number {
  let p = 0;
  // Extreme single-day move without consolidation
  if (args.changePct >= 20) p += 25;
  else if (args.changePct >= 10) p += 10;
  // Reversal: price closing far below high (failed momentum)
  if (args.closeLocation < 0.4 && args.changePct > 3) p += 25;
  // Thin liquidity
  if (args.liquidity < 40) p += 20;
  // Volume not confirming
  if (args.rvol < 1) p += 10;
  if (args.hasNegativeDisclosure) p += 40;
  if (args.isRestricted) p += 80;
  return clamp(p);
}

function classify(args: {
  momentumScore: number;
  changePct: number;
  rvol: number;
  closeLocation: number;
  riskPenalty: number;
}): MomentumClassification {
  const { momentumScore, changePct, rvol, closeLocation, riskPenalty } = args;
  if (closeLocation < 0.35 && changePct > 3 && rvol >= 1) return "failed_momentum";
  if (changePct >= 20) return "extended_momentum_risk";
  if (momentumScore >= 75 && changePct >= 5 && rvol >= 1.5 && riskPenalty < 30)
    return "strong_momentum_candidate";
  if (changePct >= 3 && rvol >= 1.2 && riskPenalty < 40)
    return "early_momentum_candidate";
  return "watch_only";
}

function buildReason(s: MomentumScore): string {
  const ch = s.todayChangePercent.toFixed(1);
  const rv = s.relativeVolume.toFixed(2);
  switch (s.classification) {
    case "strong_momentum_candidate":
      return `Saham naik ${ch}% dengan RVOL ${rv} dan breakout intraday valid — kandidat momentum kuat.`;
    case "early_momentum_candidate":
      return `Saham naik ${ch}% dengan volume mulai naik (RVOL ${rv}). Momentum awal, layak dipantau.`;
    case "extended_momentum_risk":
      return `Saham naik ${ch}% — sudah ekstrem. Risk tinggi, hanya boleh micro entry atau watch.`;
    case "failed_momentum":
      return `Saham sempat naik ${ch}% tapi reversal tajam — momentum gagal, jangan entry.`;
    case "watch_only":
    default:
      return `Saham bergerak ${ch}% (RVOL ${rv}). Belum cukup kuat untuk masuk trade candidate.`;
  }
}

/** Core scorer. Pure function over a quote + optional context. */
export function computeMomentum(
  q: Quote,
  inputs: MomentumInputs = {},
): MomentumScore {
  const price = q.price ?? null;
  const prev = q.prevClose ?? null;
  const high = q.high ?? null;
  const low = q.low ?? null;
  const changePct = Number(q.changePercent ?? 0);
  const volume = Number(q.volume ?? 0);
  const avgVol = Number(inputs.avgVolume ?? 0);
  // Fallback heuristic: assume "today's volume" with a flat baseline if no avg.
  const baselineVol = avgVol > 0 ? avgVol : Math.max(1, volume * 0.6);
  const rvol = baselineVol > 0 ? volume / baselineVol : 0;

  const closeLocation = (price && high && low && high > low)
    ? (price - low) / (high - low) : 0.5;

  const changeScore = scoreChange(changePct);
  const rvolScore = scoreRvol(rvol);
  const breakoutScore = scoreBreakout(q);
  const trendScore = scoreTrend(q);
  const liquidityScore = scoreLiquidity(volume, price);
  const catalystScore = scoreCatalyst(
    inputs.catalystCount ?? 0,
    inputs.catalystSentiment ?? null,
  );
  const riskPenalty = computeRiskPenalty({
    changePct: Math.abs(changePct), rvol, liquidity: liquidityScore,
    hasNegativeDisclosure: inputs.hasNegativeDisclosure,
    isRestricted: inputs.isRestricted, closeLocation,
  });

  // Weighted blend; biggest weights to change + rvol + breakout (the core momentum trio)
  const blended =
    changeScore * 0.25 +
    rvolScore * 0.20 +
    breakoutScore * 0.20 +
    trendScore * 0.15 +
    catalystScore * 0.10 +
    liquidityScore * 0.10;
  const momentumScore = clamp(blended - riskPenalty * 0.25);

  const warnings: string[] = [];
  if (Math.abs(changePct) >= 20) warnings.push("Pergerakan ekstrem (>20%)");
  if (rvol < 1) warnings.push("Volume belum mengkonfirmasi");
  if (liquidityScore < 40) warnings.push("Likuiditas tipis");
  if (inputs.hasNegativeDisclosure) warnings.push("Disclosure negatif aktif");
  if (inputs.isRestricted) warnings.push("Saham di-suspend / UMA");

  const classification = classify({
    momentumScore, changePct: Math.abs(changePct), rvol, closeLocation, riskPenalty,
  });

  const base: MomentumScore = {
    symbol: q.symbol,
    todayChangePercent: changePct,
    relativeVolume: rvol,
    volume,
    price, prevClose: prev, dayHigh: high, dayLow: low,
    changeScore: +changeScore.toFixed(1),
    rvolScore: +rvolScore.toFixed(1),
    breakoutScore: +breakoutScore.toFixed(1),
    trendScore: +trendScore.toFixed(1),
    catalystScore: +catalystScore.toFixed(1),
    liquidityScore: +liquidityScore.toFixed(1),
    riskPenalty: +riskPenalty.toFixed(1),
    momentumScore: +momentumScore.toFixed(1),
    classification,
    catalystSummary: inputs.catalystSummary ?? null,
    reason: "",
    warnings,
  };
  base.reason = buildReason(base);
  return base;
}

/**
 * Fetch a broad IDX universe and rank by today's |change%| + volume.
 * Returns top-N quotes for momentum scoring. Pulls catalyst counts from
 * news_articles (last 24h) in a single bulk query.
 */
export async function fetchMarketMovers(
  topN = 20,
): Promise<MomentumScore[]> {
  // Universe: LQ45 + symbols appearing in recent news. We don't have a full
  // intraday gainer feed, so this is a pragmatic IDX-focused proxy that still
  // catches news-driven movers outside LQ45.
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const newsByTicker = new Map<string, { count: number; sentSum: number; sample: string | null; neg: boolean }>();
  try {
    const { data: news } = await supabaseAdmin
      .from("news_articles")
      .select("tickers, sentiment_score, sentiment, title, impact_level")
      .gte("published_at", since)
      .eq("is_duplicate", false)
      .order("published_at", { ascending: false })
      .limit(120);
    for (const n of news ?? []) {
      const tickers = ((n as any).tickers ?? []) as string[];
      for (const t of tickers) {
        const sym = t.includes(".") ? t.toUpperCase() : `${t.toUpperCase()}.JK`;
        const entry = newsByTicker.get(sym) ?? { count: 0, sentSum: 0, sample: null, neg: false };
        entry.count += 1;
        entry.sentSum += Number((n as any).sentiment_score ?? 0);
        if (!entry.sample) entry.sample = (n as any).title ?? null;
        if ((n as any).sentiment === "negative" && (n as any).impact_level === "high") entry.neg = true;
        newsByTicker.set(sym, entry);
      }
    }
  } catch { /* tolerate */ }

  // Combine LQ45 with any news-tickers not in LQ45.
  const universe = new Set<string>(IDX_LQ45);
  for (const sym of newsByTicker.keys()) universe.add(sym);
  const symbols = Array.from(universe).slice(0, 60);

  let quotes: Quote[] = [];
  try {
    quotes = await getQuotes({ data: { symbols } }) as Quote[];
  } catch { quotes = []; }

  const scored: MomentumScore[] = [];
  for (const q of quotes) {
    if (!q?.price) continue;
    const ctx = newsByTicker.get(q.symbol);
    const sentiment = ctx && ctx.count > 0 ? ctx.sentSum / ctx.count : null;
    const s = computeMomentum(q, {
      catalystCount: ctx?.count ?? 0,
      catalystSentiment: sentiment,
      catalystSummary: ctx?.sample ?? null,
      hasNegativeDisclosure: ctx?.neg ?? false,
    });
    scored.push(s);
  }

  // Rank by raw |change%| * sqrt(rvol) so true movers + high-volume bubble up.
  scored.sort((a, b) => {
    const sa = Math.abs(a.todayChangePercent) * Math.sqrt(Math.max(0.1, a.relativeVolume));
    const sb = Math.abs(b.todayChangePercent) * Math.sqrt(Math.max(0.1, b.relativeVolume));
    return sb - sa;
  });

  return scored.slice(0, topN);
}

/** Module 6 — momentum-specific SL / TP based on classification + entry. */
export function momentumStops(entry: number, c: MomentumClassification): {
  stopLoss: number; takeProfit: number;
} {
  if (c === "extended_momentum_risk") {
    return { stopLoss: +(entry * 0.98).toFixed(2), takeProfit: +(entry * 1.04).toFixed(2) };
  }
  if (c === "strong_momentum_candidate") {
    return { stopLoss: +(entry * 0.97).toFixed(2), takeProfit: +(entry * 1.07).toFixed(2) };
  }
  // early_momentum / watch
  return { stopLoss: +(entry * 0.965).toFixed(2), takeProfit: +(entry * 1.06).toFixed(2) };
}
