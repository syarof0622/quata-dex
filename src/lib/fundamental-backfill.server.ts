// Update 12 — Fundamental backfill orchestrator.
// Server-only. Picks a universe (open positions + watchlist + top scanner
// candidates), fetches from Twelve Data / SerpApi via fundamental-sources,
// upserts snapshot + valuation, recomputes sector medians, then derives
// fundamental_signal_snapshots + fundamental_quality_scores rows.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  fetchFundamentalFromSources,
  upsertFundamentalSnapshot,
  upsertValuationMetrics,
  type RawFundamentalSnapshot,
  type RawValuationMetrics,
} from "./fundamental-sources.server";
import {
  computeFundamentalSignal,
  type SectorBenchmark,
} from "./fundamental-signal.server";
import type { FundamentalDTO } from "./fundamentals.functions";
import { calculateFundamentalConfidence } from "./fundamental-confidence.server";
import { linkFundamentalToNews } from "./fundamental-news-linker.server";

const HARDCODED_USER = "00000000-0000-0000-0000-000000000001";

// ---------- universe selection ----------
export async function selectUniverse(limit = 30): Promise<string[]> {
  const set = new Set<string>();

  // open positions
  try {
    const { data } = await supabaseAdmin
      .from("paper_positions")
      .select("symbol")
      .eq("user_id", HARDCODED_USER);
    for (const r of data ?? []) if (r?.symbol) set.add(String(r.symbol).toUpperCase());
  } catch {}

  // watchlist
  try {
    const { data } = await supabaseAdmin
      .from("watchlist")
      .select("symbol")
      .eq("user_id", HARDCODED_USER);
    for (const r of (data ?? []) as any[]) if (r?.symbol) set.add(String(r.symbol).toUpperCase());
  } catch {}

  // recent scanner candidates
  try {
    const { data } = await supabaseAdmin
      .from("ai_agent_scan_candidates")
      .select("symbol")
      .order("created_at", { ascending: false })
      .limit(50);
    for (const r of (data ?? []) as any[]) if (r?.symbol) set.add(String(r.symbol).toUpperCase());
  } catch {}

  return Array.from(set).slice(0, limit);
}

// ---------- DTO adapter (raw rows -> FundamentalDTO for signal engine) ----------
function toDTO(
  symbol: string,
  snap: RawFundamentalSnapshot | null,
  val: RawValuationMetrics | null,
): FundamentalDTO | null {
  if (!snap && !val) return null;
  const div = (n: number | null | undefined) => (n == null ? null : n / 100);
  return {
    symbol,
    profile: {
      longName: snap?.company_name ?? null,
      sector: val?.sector ?? snap?.sector ?? null,
      industry: null,
      country: "ID",
      website: null,
      fullTimeEmployees: null,
      summary: null,
    },
    price: {
      currency: snap?.currency ?? "IDR",
      marketCap: val?.market_cap ?? null,
      regularMarketPrice: val?.price ?? null,
    },
    valuation: {
      trailingPE: val?.per ?? null,
      forwardPE: null,
      pegRatio: null,
      priceToBook: val?.pbv ?? null,
      priceToSales: val?.ps ?? null,
      enterpriseToEbitda: val?.ev_ebitda ?? null,
      enterpriseToRevenue: null,
    },
    profitability: {
      profitMargin: div(val?.npm ?? null),
      operatingMargin: div(val?.opm ?? null),
      grossMargin: div(val?.gpm ?? null),
      returnOnEquity: div(val?.roe ?? null),
      returnOnAssets: div(val?.roa ?? null),
      ebitdaMargin: null,
    },
    growth: {
      revenueGrowth: div(val?.revenue_growth_yoy ?? null),
      earningsGrowth: div(val?.net_income_growth_yoy ?? null),
      earningsQuarterlyGrowth: null,
    },
    health: {
      totalCash: snap?.cash ?? null,
      totalDebt: snap?.total_debt ?? null,
      debtToEquity: val?.der ?? null,
      currentRatio: null,
      quickRatio: null,
      freeCashflow: snap?.free_cashflow ?? null,
      operatingCashflow: snap?.operating_cashflow ?? null,
    },
    dividends: {
      dividendRate: val?.dividend_per_share ?? null,
      dividendYield: div(val?.dividend_yield ?? null),
      payoutRatio: val?.payout_ratio ?? null,
      exDividendDate: null,
    },
    earnings: {
      nextEarningsDate: null,
      epsTrailing: snap?.eps ?? null,
      epsForward: null,
      epsRevisionsUp: null,
      epsRevisionsDown: null,
    },
    recommendation: { mean: null, key: null, targetMean: null, targetHigh: null, targetLow: null, numAnalysts: null },
    statements: {
      income: snap?.report_date
        ? [{
            date: snap.report_date,
            revenue: snap.revenue,
            netIncome: snap.net_income,
            grossProfit: snap.gross_profit,
            operatingIncome: snap.operating_profit,
          }]
        : [],
      balance: snap?.report_date
        ? [{
            date: snap.report_date,
            totalAssets: snap.total_assets,
            totalLiab: snap.total_liabilities,
            totalEquity: snap.total_equity,
            cash: snap.cash,
          }]
        : [],
      cashflow: snap?.report_date
        ? [{
            date: snap.report_date,
            operating: snap.operating_cashflow,
            investing: snap.investing_cashflow,
            financing: snap.financing_cashflow,
            capex: snap.capex,
          }]
        : [],
    },
    asOf: new Date().toISOString(),
  };
}

// ---------- sector benchmark recompute ----------
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const clean = (xs: (number | null | undefined)[]) =>
  xs.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0);

export async function recomputeSectorBenchmarks(): Promise<number> {
  const { data } = await supabaseAdmin
    .from("valuation_metrics")
    .select("symbol, sector, per, pbv, roe, der, revenue_growth_yoy, eps_growth_yoy, net_income_growth_yoy, dividend_yield");
  const rows = data ?? [];
  const bySector = new Map<string, any[]>();
  for (const r of rows) {
    const s = (r as any).sector;
    if (!s) continue;
    const arr = bySector.get(s) ?? [];
    arr.push(r);
    bySector.set(s, arr);
  }
  let updated = 0;
  for (const [sector, list] of bySector) {
    const per = clean(list.map((r) => r.per));
    const pbv = clean(list.map((r) => r.pbv));
    const roe = clean(list.map((r) => r.roe));
    const der = clean(list.map((r) => r.der));
    const revG = clean(list.map((r) => r.revenue_growth_yoy));
    const epsG = clean(list.map((r) => r.eps_growth_yoy));
    const niG = clean(list.map((r) => r.net_income_growth_yoy));
    const dy = clean(list.map((r) => r.dividend_yield));
    const sample = list.length;
    const conf = sample >= 8 ? "high" : sample >= 4 ? "medium" : "low";

    await supabaseAdmin
      .from("sector_fundamental_benchmarks")
      .upsert(
        {
          sector,
          median_per: median(per),
          median_pbv: median(pbv),
          median_roe: median(roe),
          median_der: median(der),
          median_revenue_growth: median(revG),
          median_profit_growth: median(niG),
          median_dividend_yield: median(dy),
          median_eps_growth_yoy: median(epsG),
          median_revenue_growth_yoy: median(revG),
          median_net_income_growth_yoy: median(niG),
          avg_per: mean(per),
          avg_pbv: mean(pbv),
          avg_roe: mean(roe),
          avg_der: mean(der),
          sample_size: sample,
          benchmark_confidence: conf,
          included_symbols: list.map((r) => r.symbol),
          excluded_symbols: [],
          as_of: new Date().toISOString(),
        },
        { onConflict: "sector" },
      );
    updated++;
  }
  return updated;
}

export async function loadSectorBenchmark(sector: string | null): Promise<SectorBenchmark> {
  if (!sector) return {};
  const { data } = await supabaseAdmin
    .from("sector_fundamental_benchmarks")
    .select("median_per, median_pbv, median_roe")
    .eq("sector", sector)
    .maybeSingle();
  if (!data) return {};
  return {
    per: (data as any).median_per != null ? Number((data as any).median_per) : null,
    pbv: (data as any).median_pbv != null ? Number((data as any).median_pbv) : null,
    roe: (data as any).median_roe != null ? Number((data as any).median_roe) : null,
  };
}

// ---------- per-symbol backfill ----------
export type BackfillRow = {
  symbol: string;
  sourceUsed: string | null;
  sourceTried: string[];
  label: string;
  confidence: number;
  partial: boolean;
};

async function persistSignal(
  symbol: string,
  dto: FundamentalDTO | null,
  val: RawValuationMetrics | null,
  bench: SectorBenchmark,
  sourceUsed: string | null,
  sourceUrl: string | null,
) {
  const sig = computeFundamentalSignal(symbol, dto, bench);
  await supabaseAdmin.from("fundamental_signal_snapshots").insert({
    symbol,
    sector: val?.sector ?? dto?.profile.sector ?? null,
    final_fundamental_label: sig.label,
    confidence: sig.confidence,
    undervalue_score: sig.undervalueScore,
    valuation_score: sig.scores.valuation,
    quality_score: sig.scores.quality,
    growth_score: sig.scores.growth,
    profitability_score: sig.scores.profitability,
    solvency_score: sig.scores.solvency,
    dividend_score: sig.scores.dividend,
    value_trap_risk: sig.valueTrapRisk,
    value_trap_level: sig.valueTrapLevel,
    value_trap_reasons: sig.valueTrapReasons as any,
    valuation_status: sig.valuationStatus,
    explanation: sig.explanation,
    reasons: sig.reasons as any,
    warnings: sig.warnings as any,
    positive_reasons: sig.reasons.filter((r) => /murah|kuat|positif/i.test(r)) as any,
    negative_reasons: sig.reasons.filter((r) => /mahal|lemah|melemah|trap/i.test(r)) as any,
    missing_data_reasons: sig.quality.missingFields as any,
    key_metrics: sig.keyMetrics as any,
    per: val?.per ?? null,
    pbv: val?.pbv ?? null,
    roe: val?.roe ?? null,
    der: val?.der ?? null,
    dividend_yield: val?.dividend_yield ?? null,
    sector_median_per: bench.per ?? null,
    sector_median_pbv: bench.pbv ?? null,
    sector_median_roe: bench.roe ?? null,
    source: sourceUsed,
    source_url: sourceUrl,
  });

  await supabaseAdmin.from("fundamental_quality_scores").insert({
    symbol,
    completeness_score: sig.quality.completenessScore,
    freshness_score: sig.quality.freshnessScore,
    consistency_score: sig.quality.consistencyScore,
    confidence_score: sig.quality.confidenceScore,
    source_score: sourceUsed ? (sourceUsed === "twelve_data" ? 90 : 60) : 0,
    status: sig.quality.status,
    fundamental_freshness:
      sig.quality.freshnessScore >= 85 ? "fresh" :
      sig.quality.freshnessScore >= 50 ? "stale" :
      sig.quality.freshnessScore > 0 ? "very_stale" : "unavailable",
    missing_fields: sig.quality.missingFields as any,
    stale_fields: sig.quality.staleFields as any,
    warnings: sig.quality.warnings as any,
    blocking_reasons: (sig.label === "INSUFFICIENT_DATA" ? sig.quality.warnings : []) as any,
  });

  return sig;
}

async function upsertStockFundamentalsBridge(
  symbol: string,
  snap: RawFundamentalSnapshot | null,
  val: RawValuationMetrics | null,
  sourceUsed: string | null,
) {
  if (!snap && !val) return;

  // Fetch existing row so we PRESERVE last-known-good values when a source
  // returns a partial payload (rule 14: "do not wipe previously valid data").
  const { data: prev } = await supabaseAdmin
    .from("stock_fundamentals")
    .select("*")
    .eq("symbol", symbol)
    .maybeSingle();

  const pick = <K extends keyof any>(fresh: number | null | undefined, key: string): number | null => {
    if (fresh != null && Number.isFinite(Number(fresh))) return Number(fresh);
    const p = (prev as any)?.[key];
    return p != null && Number.isFinite(Number(p)) ? Number(p) : null;
  };
  const pickStr = (fresh: string | null | undefined, key: string): string | null => {
    if (fresh) return fresh;
    return ((prev as any)?.[key] as string | null) ?? null;
  };

  const hasFresh = !!val || !!snap;
  const row = {
    symbol,
    company_name: pickStr(snap?.company_name ?? null, "company_name"),
    sector: pickStr(val?.sector ?? snap?.sector ?? null, "sector"),
    industry: pickStr(null, "industry"),
    price: pick(val?.price ?? null, "price"),
    market_cap: pick(val?.market_cap ?? null, "market_cap"),
    shares_outstanding: pick(val?.shares_outstanding ?? snap?.shares_outstanding ?? null, "shares_outstanding"),
    per: pick(val?.per ?? null, "per"),
    pbv: pick(val?.pbv ?? null, "pbv"),
    eps: pick(snap?.eps ?? null, "eps"),
    book_value_per_share: pick(snap?.book_value_per_share ?? null, "book_value_per_share"),
    roe: pick(val?.roe ?? null, "roe"),
    roa: pick(val?.roa ?? null, "roa"),
    der: pick(val?.der ?? null, "der"),
    revenue: pick(snap?.revenue ?? null, "revenue"),
    revenue_growth_yoy: pick(val?.revenue_growth_yoy ?? null, "revenue_growth_yoy"),
    net_profit: pick(snap?.net_income ?? null, "net_profit"),
    net_profit_growth_yoy: pick(val?.net_income_growth_yoy ?? null, "net_profit_growth_yoy"),
    eps_growth_yoy: pick(val?.eps_growth_yoy ?? null, "eps_growth_yoy"),
    gross_margin: pick(val?.gpm ?? null, "gross_margin"),
    net_margin: pick(val?.npm ?? null, "net_margin"),
    operating_cash_flow: pick(snap?.operating_cashflow ?? null, "operating_cash_flow"),
    free_cash_flow: pick(snap?.free_cashflow ?? null, "free_cash_flow"),
    dividend_yield: pick(val?.dividend_yield ?? null, "dividend_yield"),
    dividend_per_share: pick(val?.dividend_per_share ?? null, "dividend_per_share"),
    total_equity: pick(snap?.total_equity ?? null, "total_equity"),
    total_assets: pick(snap?.total_assets ?? null, "total_assets"),
    total_debt: pick(snap?.total_debt ?? null, "total_debt"),
    financial_report_date: snap?.report_date ?? (prev as any)?.financial_report_date ?? null,
    data_source: sourceUsed ?? (prev as any)?.data_source ?? null,
    raw_payload: { snapshot: snap, valuation: val, source: sourceUsed } as any,
    status: hasFresh ? "ok" : ((prev as any)?.status ?? "stale"),
    data_freshness: hasFresh ? new Date().toISOString() : ((prev as any)?.data_freshness ?? new Date().toISOString()),
  };

  // --- News validation context (links + notes) ---
  let validationNotes: string[] = [];
  let relatedNewsCount = 0;
  try {
    const linkRes = await linkFundamentalToNews(symbol);
    validationNotes = linkRes.validationNotes;
    relatedNewsCount = linkRes.relatedNewsCount;
  } catch {}

  // --- Confidence / status engine ---
  const conf = calculateFundamentalConfidence({
    metrics: {
      per: row.per, pbv: row.pbv, roe: row.roe, der: row.der,
      dividend_yield: row.dividend_yield, market_cap: row.market_cap,
      price: row.price, eps: row.eps,
      eps_growth_yoy: row.eps_growth_yoy,
      revenue_growth_yoy: row.revenue_growth_yoy,
      net_profit_growth_yoy: row.net_profit_growth_yoy,
      revenue: row.revenue, net_profit: row.net_profit,
      total_equity: row.total_equity, total_debt: row.total_debt,
      book_value_per_share: row.book_value_per_share,
    },
    sourcePrimary: sourceUsed,
    sourcesUsed: [sourceUsed].filter(Boolean) as string[],
    lastFundamentalFetchAt: hasFresh ? new Date().toISOString() : ((prev as any)?.last_fundamental_fetch_at ?? null),
    relatedNewsCount,
  });

  const enriched = {
    ...row,
    price_last: row.price,
    source_primary: sourceUsed ?? (prev as any)?.source_primary ?? null,
    source_confidence: conf.sourceConfidence,
    confidence_label: conf.confidenceLabel,
    data_status: conf.dataStatus,
    freshness_status: conf.freshnessStatus,
    missing_fields: conf.missingFields,
    missing_reason: conf.missingReason as any,
    validation_notes: Array.from(new Set([...conf.validationNotes, ...validationNotes])),
    last_fundamental_fetch_at: hasFresh ? new Date().toISOString() : ((prev as any)?.last_fundamental_fetch_at ?? null),
    last_market_fetch_at: hasFresh && val ? new Date().toISOString() : ((prev as any)?.last_market_fetch_at ?? null),
    reporting_period: snap?.period ?? (prev as any)?.reporting_period ?? null,
    currency: snap?.currency ?? (prev as any)?.currency ?? "IDR",
  };

  await supabaseAdmin.from("stock_fundamentals").upsert(enriched, { onConflict: "symbol" });
}

export async function backfillSymbol(symbol: string): Promise<BackfillRow> {
  const res = await fetchFundamentalFromSources(symbol);
  if (res.snapshot) await upsertFundamentalSnapshot(res.snapshot);
  if (res.valuation) await upsertValuationMetrics(res.valuation);

  // Bridge into stock_fundamentals so Portfolio + AI Analyst + Undervalue
  // (which read from stock_fundamentals) see the same data as the signal layer.
  await upsertStockFundamentalsBridge(symbol, res.snapshot, res.valuation, res.sourceUsed);

  const sector = res.valuation?.sector ?? res.snapshot?.sector ?? null;
  const bench = await loadSectorBenchmark(sector);
  const dto = toDTO(symbol, res.snapshot, res.valuation);
  const sig = await persistSignal(
    symbol,
    dto,
    res.valuation,
    bench,
    res.sourceUsed,
    res.valuation?.source_url ?? res.snapshot?.source_url ?? null,
  );

  return {
    symbol,
    sourceUsed: res.sourceUsed,
    sourceTried: res.sourceTried,
    label: sig.label,
    confidence: sig.confidence,
    partial: res.partial,
  };
}


export type BackfillReport = {
  ran_at: string;
  universe_size: number;
  processed: number;
  rows: BackfillRow[];
  sectors_updated: number;
  errors: { symbol: string; error: string }[];
};

export async function runFundamentalBackfill(opts: { limit?: number; symbols?: string[] } = {}): Promise<BackfillReport> {
  const universe = opts.symbols?.length
    ? opts.symbols.map((s) => s.toUpperCase())
    : await selectUniverse(opts.limit ?? 25);
  const rows: BackfillRow[] = [];
  const errors: { symbol: string; error: string }[] = [];
  for (const sym of universe) {
    try {
      rows.push(await backfillSymbol(sym));
    } catch (e: any) {
      errors.push({ symbol: sym, error: String(e?.message ?? e) });
    }
  }
  const sectors = await recomputeSectorBenchmarks();
  return {
    ran_at: new Date().toISOString(),
    universe_size: universe.length,
    processed: rows.length,
    rows,
    sectors_updated: sectors,
    errors,
  };
}
