// Update 12 — Fundamental source abstraction (Twelve Data + SerpApi).
// Server-only. Tolerant to missing API keys / failed providers — returns null
// instead of throwing so the pipeline can persist INSUFFICIENT_DATA gracefully.
//
// Priority (high → low):
//   1. manual_import rows already present in fundamental_snapshots
//   2. twelve_data (statistics + income_statement + balance_sheet + cashflow)
//   3. serpapi_google_finance (PER / PBV / market cap / dividend yield)
//
// We DO NOT call Yahoo here — fundamentals-fetcher.server.ts already covers
// that path. This file specifically targets IDX coverage via the two
// existing project secrets.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchFundamentalFromNews } from "./fundamental-news-extractor.server";
import { fetchFundamentalsFromYahoo } from "./fundamentals-fetcher.server";

// ---------- Yahoo Finance fallback (free, no key) ----------
// Wraps fetchFundamentalsFromYahoo() and projects into RawValuationMetrics.
async function fetchYahooValuation(symbol: string): Promise<RawValuationMetrics | null> {
  const y = await fetchFundamentalsFromYahoo(symbol);
  if (!y) return null;
  const hasAny =
    y.per != null || y.pbv != null || y.roe != null || y.der != null || y.dividend_yield != null;
  if (!hasAny) return null;
  return {
    symbol: y.symbol,
    sector: y.sector,
    price: null,
    market_cap: y.market_cap,
    shares_outstanding: null,
    source: "yahoo_quote_summary",
    source_url: `https://finance.yahoo.com/quote/${encodeURIComponent(y.symbol)}`,
    per: y.per,
    pbv: y.pbv,
    ps: null,
    ev_ebitda: null,
    dividend_yield: y.dividend_yield,
    dividend_per_share: null,
    roe: y.roe,
    roa: y.roa,
    npm: y.net_margin,
    gpm: y.gross_margin,
    opm: null,
    der: y.der,
    debt_to_assets: null,
    eps_growth_yoy: null,
    revenue_growth_yoy: y.revenue_growth_yoy,
    net_income_growth_yoy: y.net_profit_growth_yoy,
    fcf_yield: null,
    operating_cashflow_margin:
      y.operating_cash_flow != null && y.revenue ? y.operating_cash_flow / y.revenue : null,
    payout_ratio: y.dividend_payout_ratio,
    calculation_method: "yahoo_quote_summary_v1",
    raw_payload: y.raw_payload,
  };
}

// ---------- shared helpers ----------
const num = (v: unknown): number | null => {
  if (v == null) return null;
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : null;
};

const ua =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// ---------- normalized output shape ----------
export type RawFundamentalSnapshot = {
  symbol: string;
  company_name: string | null;
  sector: string | null;
  period: string;
  fiscal_year: number;
  fiscal_quarter: number | null;
  report_date: string | null; // ISO
  source: string;
  source_url: string | null;
  currency: string;
  // income
  revenue: number | null;
  gross_profit: number | null;
  operating_profit: number | null;
  net_income: number | null;
  eps: number | null;
  // balance
  total_assets: number | null;
  total_liabilities: number | null;
  total_equity: number | null;
  total_debt: number | null;
  cash: number | null;
  book_value_per_share: number | null;
  shares_outstanding: number | null;
  // cashflow
  operating_cashflow: number | null;
  investing_cashflow: number | null;
  financing_cashflow: number | null;
  capex: number | null;
  free_cashflow: number | null;
  raw_payload: unknown;
  data_quality: "high" | "medium" | "low";
};

export type RawValuationMetrics = {
  symbol: string;
  sector: string | null;
  price: number | null;
  market_cap: number | null;
  shares_outstanding: number | null;
  source: string;
  source_url: string | null;
  // valuation
  per: number | null;
  pbv: number | null;
  ps: number | null;
  ev_ebitda: number | null;
  dividend_yield: number | null;
  dividend_per_share: number | null;
  // profitability
  roe: number | null;
  roa: number | null;
  npm: number | null;
  gpm: number | null;
  opm: number | null;
  // solvency
  der: number | null;
  debt_to_assets: number | null;
  // growth (computed downstream when YoY data exists)
  eps_growth_yoy: number | null;
  revenue_growth_yoy: number | null;
  net_income_growth_yoy: number | null;
  // cashflow
  fcf_yield: number | null;
  operating_cashflow_margin: number | null;
  // dividend
  payout_ratio: number | null;
  calculation_method: string;
  raw_payload: unknown;
};

export type SourceConfig = {
  twelveDataEnabled: boolean;
  serpapiEnabled: boolean;
  manualImportPriority: number;
};

export function getFundamentalSourceConfig(): SourceConfig {
  return {
    twelveDataEnabled: !!process.env.TWELVE_DATA_API_KEY,
    serpapiEnabled: !!process.env.SERPAPI_API_KEY,
    manualImportPriority: 1, // highest
  };
}

// ---------- Twelve Data fetcher ----------
async function fetchTwelveData(symbol: string): Promise<{
  snapshot: RawFundamentalSnapshot | null;
  valuation: RawValuationMetrics | null;
} | null> {
  const key = process.env.TWELVE_DATA_API_KEY;
  if (!key) return null;
  // Twelve Data uses ":exchange" suffix for IDX (BBCA:IDX). Strip .JK.
  const sym = symbol.replace(/\.JK$/i, "") + ":IDX";

  const fetchJson = async (url: string): Promise<any | null> => {
    try {
      const r = await fetch(url, { headers: { "User-Agent": ua } });
      if (!r.ok) return null;
      const j = await r.json();
      if (j?.status === "error" || j?.code) return null;
      return j;
    } catch {
      return null;
    }
  };

  const base = "https://api.twelvedata.com";
  const [stats, quote, income, balance, cashflow] = await Promise.all([
    fetchJson(`${base}/statistics?symbol=${encodeURIComponent(sym)}&apikey=${key}`),
    fetchJson(`${base}/quote?symbol=${encodeURIComponent(sym)}&apikey=${key}`),
    fetchJson(`${base}/income_statement?symbol=${encodeURIComponent(sym)}&period=annual&apikey=${key}`),
    fetchJson(`${base}/balance_sheet?symbol=${encodeURIComponent(sym)}&period=annual&apikey=${key}`),
    fetchJson(`${base}/cash_flow?symbol=${encodeURIComponent(sym)}&period=annual&apikey=${key}`),
  ]);

  // If nothing succeeded, give up.
  if (!stats && !quote && !income && !balance && !cashflow) return null;

  const stat = stats?.statistics ?? {};
  const valuationStat = stat?.valuations_metrics ?? {};
  const profitStat = stat?.financials?.ratios?.profitability ?? stat?.financials?.profitability ?? {};
  const incomeRows: any[] = Array.isArray(income?.income_statement) ? income.income_statement : [];
  const balanceRows: any[] = Array.isArray(balance?.balance_sheet) ? balance.balance_sheet : [];
  const cashRows: any[] = Array.isArray(cashflow?.cash_flow) ? cashflow.cash_flow : [];

  const latestIncome = incomeRows[0] ?? null;
  const prevIncome = incomeRows[1] ?? null;
  const latestBalance = balanceRows[0] ?? null;
  const latestCash = cashRows[0] ?? null;

  const fiscalYearRaw =
    latestIncome?.fiscal_year ??
    latestIncome?.fiscal_date?.slice(0, 4) ??
    new Date().getFullYear();
  const fiscalYear = Number(fiscalYearRaw) || new Date().getFullYear();
  const reportDate = latestIncome?.fiscal_date ?? latestBalance?.fiscal_date ?? null;

  const revenue = num(latestIncome?.sales ?? latestIncome?.revenue);
  const prevRevenue = num(prevIncome?.sales ?? prevIncome?.revenue);
  const netIncome = num(latestIncome?.net_income);
  const prevNetIncome = num(prevIncome?.net_income);
  const eps = num(latestIncome?.eps ?? stat?.financials?.most_recent_quarter?.eps ?? valuationStat?.trailing_eps);
  const prevEps = num(prevIncome?.eps);
  const grossProfit = num(latestIncome?.gross_profit);
  const operatingProfit = num(latestIncome?.operating_income);
  const totalAssets = num(latestBalance?.total_assets);
  const totalLiabilities = num(latestBalance?.total_liabilities);
  const totalEquity = num(latestBalance?.total_stockholders_equity ?? latestBalance?.total_equity);
  const totalDebt = num(latestBalance?.total_debt ?? latestBalance?.long_term_debt);
  const cash = num(latestBalance?.cash_and_short_term_investments ?? latestBalance?.cash);
  const sharesOutstanding = num(stat?.statistics?.shares_outstanding ?? valuationStat?.shares_outstanding);
  const bookValuePerShare = num(stat?.statistics?.book_value_per_share ?? valuationStat?.book_value_per_share);
  const operatingCashflow = num(latestCash?.operating_activities?.cash_flow_from_operating_activities ?? latestCash?.cash_from_operating_activities);
  const investingCashflow = num(latestCash?.investing_activities?.cash_flow_from_investing_activities ?? latestCash?.cash_from_investing_activities);
  const financingCashflow = num(latestCash?.financing_activities?.cash_flow_from_financing_activities ?? latestCash?.cash_from_financing_activities);
  const capex = num(latestCash?.investing_activities?.capital_expenditures ?? latestCash?.capital_expenditures);
  const freeCashflow = operatingCashflow != null && capex != null ? operatingCashflow + capex : null;

  const price = num(quote?.close ?? quote?.price);
  const marketCap = num(stat?.statistics?.market_capitalization ?? valuationStat?.market_capitalization) ??
    (price != null && sharesOutstanding != null ? price * sharesOutstanding : null);
  const per = num(valuationStat?.trailing_pe ?? valuationStat?.pe_ratio) ??
    (price != null && eps != null && eps !== 0 ? price / eps : null);
  const pbv = num(valuationStat?.price_to_book) ??
    (price != null && bookValuePerShare != null && bookValuePerShare !== 0 ? price / bookValuePerShare : null);
  const ps = num(valuationStat?.price_to_sales);
  const evEbitda = num(valuationStat?.enterprise_to_ebitda);
  const dividendYield = num(stat?.dividends_and_splits?.forward_annual_dividend_yield ?? stat?.dividends_and_splits?.trailing_annual_dividend_yield);
  const dividendPerShare = num(stat?.dividends_and_splits?.forward_annual_dividend_rate);
  const payoutRatio = num(stat?.dividends_and_splits?.payout_ratio);

  const roe = num(profitStat?.return_on_equity) ??
    (netIncome != null && totalEquity != null && totalEquity !== 0 ? (netIncome / totalEquity) * 100 : null);
  const roa = num(profitStat?.return_on_assets) ??
    (netIncome != null && totalAssets != null && totalAssets !== 0 ? (netIncome / totalAssets) * 100 : null);
  const npm = num(profitStat?.profit_margin) ??
    (netIncome != null && revenue != null && revenue !== 0 ? (netIncome / revenue) * 100 : null);
  const gpm = grossProfit != null && revenue != null && revenue !== 0 ? (grossProfit / revenue) * 100 : null;
  const opm = operatingProfit != null && revenue != null && revenue !== 0 ? (operatingProfit / revenue) * 100 : null;
  const der = totalDebt != null && totalEquity != null && totalEquity !== 0 ? totalDebt / totalEquity : null;
  const debtToAssets = totalDebt != null && totalAssets != null && totalAssets !== 0 ? totalDebt / totalAssets : null;
  const fcfYield = freeCashflow != null && marketCap != null && marketCap !== 0 ? (freeCashflow / marketCap) * 100 : null;
  const ocfMargin = operatingCashflow != null && revenue != null && revenue !== 0 ? (operatingCashflow / revenue) * 100 : null;
  const epsGrowth = eps != null && prevEps != null && prevEps !== 0 ? ((eps - prevEps) / Math.abs(prevEps)) * 100 : null;
  const revenueGrowth = revenue != null && prevRevenue != null && prevRevenue !== 0 ? ((revenue - prevRevenue) / Math.abs(prevRevenue)) * 100 : null;
  const netIncomeGrowth = netIncome != null && prevNetIncome != null && prevNetIncome !== 0 ? ((netIncome - prevNetIncome) / Math.abs(prevNetIncome)) * 100 : null;

  const sourceUrl = `https://twelvedata.com/quote/${encodeURIComponent(sym)}`;
  const companyName = stat?.statistics?.name ?? quote?.name ?? null;
  const sector = stat?.statistics?.sector ?? null;

  const snapshot: RawFundamentalSnapshot = {
    symbol: symbol.toUpperCase(),
    company_name: companyName,
    sector,
    period: `${fiscalYear}FY`,
    fiscal_year: fiscalYear,
    fiscal_quarter: null,
    report_date: reportDate,
    source: "twelve_data",
    source_url: sourceUrl,
    currency: latestIncome?.currency ?? "IDR",
    revenue,
    gross_profit: grossProfit,
    operating_profit: operatingProfit,
    net_income: netIncome,
    eps,
    total_assets: totalAssets,
    total_liabilities: totalLiabilities,
    total_equity: totalEquity,
    total_debt: totalDebt,
    cash,
    book_value_per_share: bookValuePerShare,
    shares_outstanding: sharesOutstanding,
    operating_cashflow: operatingCashflow,
    investing_cashflow: investingCashflow,
    financing_cashflow: financingCashflow,
    capex,
    free_cashflow: freeCashflow,
    raw_payload: { stats, quote, latestIncome, latestBalance, latestCash },
    data_quality: revenue != null && netIncome != null ? "high" : "medium",
  };

  const valuation: RawValuationMetrics = {
    symbol: symbol.toUpperCase(),
    sector,
    price,
    market_cap: marketCap,
    shares_outstanding: sharesOutstanding,
    source: "twelve_data",
    source_url: sourceUrl,
    per,
    pbv,
    ps,
    ev_ebitda: evEbitda,
    dividend_yield: dividendYield != null ? dividendYield * 100 : null, // store as %
    dividend_per_share: dividendPerShare,
    roe,
    roa,
    npm,
    gpm,
    opm,
    der,
    debt_to_assets: debtToAssets,
    eps_growth_yoy: epsGrowth,
    revenue_growth_yoy: revenueGrowth,
    net_income_growth_yoy: netIncomeGrowth,
    fcf_yield: fcfYield,
    operating_cashflow_margin: ocfMargin,
    payout_ratio: payoutRatio,
    calculation_method: "twelve_data_v1",
    raw_payload: { valuationStat, quote, statSummary: stat?.statistics },
  };

  return { snapshot, valuation };
}

// ---------- SerpApi Google Finance fetcher (lighter — valuation only) ----------
async function fetchSerpApiGoogleFinance(symbol: string): Promise<RawValuationMetrics | null> {
  const key = process.env.SERPAPI_API_KEY;
  if (!key) return null;
  // Google Finance IDX format: BBCA:IDX
  const gf = symbol.replace(/\.JK$/i, "") + ":IDX";
  const url = `https://serpapi.com/search.json?engine=google_finance&q=${encodeURIComponent(gf)}&api_key=${key}`;
  try {
    const r = await fetch(url, { headers: { "User-Agent": ua } });
    if (!r.ok) return null;
    const j: any = await r.json();
    const summary = j?.summary ?? {};
    const knowledge = j?.knowledge_graph ?? {};
    const finance = j?.financials?.[0] ?? {};
    const stats = finance?.results ?? [];
    const findStat = (label: string): number | null => {
      const m = stats.find((s: any) => String(s?.label ?? "").toLowerCase().includes(label.toLowerCase()));
      if (!m) return null;
      const raw = String(m.value ?? "").replace(/[^0-9.\-eE]/g, "");
      const n = Number(raw);
      return Number.isFinite(n) ? n : null;
    };
    const price = num(summary?.price ?? summary?.extracted_price);
    const marketCap = findStat("market cap");
    const per = findStat("p/e ratio");
    const dividendYield = findStat("dividend yield");
    if (price == null && per == null && marketCap == null) return null;

    return {
      symbol: symbol.toUpperCase(),
      sector: knowledge?.industry ?? null,
      price,
      market_cap: marketCap,
      shares_outstanding: marketCap != null && price && price > 0 ? marketCap / price : null,
      source: "serpapi_google_finance",
      source_url: `https://www.google.com/finance/quote/${gf}`,
      per,
      pbv: null,
      ps: null,
      ev_ebitda: null,
      dividend_yield: dividendYield,
      dividend_per_share: null,
      roe: null,
      roa: null,
      npm: null,
      gpm: null,
      opm: null,
      der: null,
      debt_to_assets: null,
      eps_growth_yoy: null,
      revenue_growth_yoy: null,
      net_income_growth_yoy: null,
      fcf_yield: null,
      operating_cashflow_margin: null,
      payout_ratio: null,
      calculation_method: "serpapi_google_finance_v1",
      raw_payload: { summary, knowledge, finance },
    };
  } catch {
    return null;
  }
}

// ---------- audit logger ----------
async function logSourceAttempt(
  symbol: string,
  source: string,
  status: "success" | "empty" | "error",
  detail: { http_status?: number | null; error_code?: string | null; error_message?: string | null } = {},
) {
  try {
    await supabaseAdmin.from("fundamental_source_logs").insert({
      symbol,
      source,
      status,
      http_status: detail.http_status ?? null,
      error_code: detail.error_code ?? null,
      error_message: detail.error_message ?? null,
    });
  } catch {
    // logging must never break ingest
  }
}

// ---------- Multi-source orchestration ----------
export type FetchResult = {
  snapshot: RawFundamentalSnapshot | null;
  valuation: RawValuationMetrics | null;
  sourceTried: string[];
  sourceUsed: string | null;
  partial: boolean;
};


export async function fetchFundamentalFromSources(symbol: string): Promise<FetchResult> {
  const tried: string[] = [];
  const cfg = getFundamentalSourceConfig();

  // 1. Twelve Data (richest)
  if (cfg.twelveDataEnabled) {
    tried.push("twelve_data");
    try {
      const td = await fetchTwelveData(symbol);
      if (td && (td.snapshot || td.valuation)) {
        await logSourceAttempt(symbol, "twelve_data", "success");
        return {
          snapshot: td.snapshot,
          valuation: td.valuation,
          sourceTried: tried,
          sourceUsed: "twelve_data",
          partial: !td.snapshot || !td.valuation,
        };
      }
      await logSourceAttempt(symbol, "twelve_data", "empty", {
        error_message: "no data (plan may not cover IDX or symbol unsupported)",
      });
    } catch (e: any) {
      await logSourceAttempt(symbol, "twelve_data", "error", { error_message: String(e?.message ?? e) });
    }
  }

  // 2. SerpApi fallback — valuation only
  if (cfg.serpapiEnabled) {
    tried.push("serpapi_google_finance");
    try {
      const sg = await fetchSerpApiGoogleFinance(symbol);
      if (sg) {
        await logSourceAttempt(symbol, "serpapi_google_finance", "success");
        return {
          snapshot: null,
          valuation: sg,
          sourceTried: tried,
          sourceUsed: "serpapi_google_finance",
          partial: true,
        };
      }
      await logSourceAttempt(symbol, "serpapi_google_finance", "empty", {
        error_message: "no data (quota exhausted or symbol not found)",
      });
    } catch (e: any) {
      await logSourceAttempt(symbol, "serpapi_google_finance", "error", { error_message: String(e?.message ?? e) });
    }
  }

  // 3. News-mined fallback — regex over already-stored news_articles.
  //    Independent of paid APIs / external quotas.
  tried.push("news_mined");
  try {
    const nm = await fetchFundamentalFromNews(symbol);
    if (nm) {
      await logSourceAttempt(symbol, "news_mined", "success");
      return {
        snapshot: null,
        valuation: nm,
        sourceTried: tried,
        sourceUsed: "news_mined",
        partial: true,
      };
    }
    await logSourceAttempt(symbol, "news_mined", "empty", {
      error_message: "no ratios found in stored news within 120d window",
    });
  } catch (e: any) {
    await logSourceAttempt(symbol, "news_mined", "error", { error_message: String(e?.message ?? e) });
  }

  return {
    snapshot: null,
    valuation: null,
    sourceTried: tried,
    sourceUsed: null,
    partial: true,
  };
}


// ---------- Upsert helpers ----------
export async function upsertFundamentalSnapshot(s: RawFundamentalSnapshot) {
  return supabaseAdmin
    .from("fundamental_snapshots")
    .upsert(
      {
        symbol: s.symbol,
        company_name: s.company_name,
        sector: s.sector,
        period: s.period,
        fiscal_year: s.fiscal_year,
        fiscal_quarter: s.fiscal_quarter,
        report_date: s.report_date,
        source: s.source,
        source_url: s.source_url,
        currency: s.currency,
        revenue: s.revenue,
        gross_profit: s.gross_profit,
        operating_profit: s.operating_profit,
        net_income: s.net_income,
        eps: s.eps,
        total_assets: s.total_assets,
        total_liabilities: s.total_liabilities,
        total_equity: s.total_equity,
        total_debt: s.total_debt,
        cash: s.cash,
        book_value_per_share: s.book_value_per_share,
        shares_outstanding: s.shares_outstanding,
        operating_cashflow: s.operating_cashflow,
        investing_cashflow: s.investing_cashflow,
        financing_cashflow: s.financing_cashflow,
        capex: s.capex,
        free_cashflow: s.free_cashflow,
        raw_payload: s.raw_payload as any,
        data_quality: s.data_quality,
      },
      { onConflict: "symbol,fiscal_year,fiscal_quarter,source" }
    );
}

export async function upsertValuationMetrics(v: RawValuationMetrics) {
  return supabaseAdmin
    .from("valuation_metrics")
    .upsert(
      {
        symbol: v.symbol,
        sector: v.sector,
        price: v.price,
        market_cap: v.market_cap,
        shares_outstanding: v.shares_outstanding,
        source: v.source,
        source_url: v.source_url,
        per: v.per,
        pbv: v.pbv,
        ps: v.ps,
        ev_ebitda: v.ev_ebitda,
        dividend_yield: v.dividend_yield,
        dividend_per_share: v.dividend_per_share,
        roe: v.roe,
        roa: v.roa,
        npm: v.npm,
        gpm: v.gpm,
        opm: v.opm,
        der: v.der,
        debt_to_assets: v.debt_to_assets,
        eps_growth_yoy: v.eps_growth_yoy,
        revenue_growth_yoy: v.revenue_growth_yoy,
        net_income_growth_yoy: v.net_income_growth_yoy,
        fcf_yield: v.fcf_yield,
        operating_cashflow_margin: v.operating_cashflow_margin,
        payout_ratio: v.payout_ratio,
        calculation_method: v.calculation_method,
        raw_payload: v.raw_payload as any,
        as_of: new Date().toISOString(),
      },
      { onConflict: "symbol,as_of,source" }
    );
}
