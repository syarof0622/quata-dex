// Fundamentals fetcher — Yahoo Finance quoteSummary (public endpoint).
// Worker-safe; tolerant to missing fields. Server-only (`.server.ts`).
//
// Yahoo's quoteSummary v10 increasingly requires a crumb cookie. We attempt
// without one first (works for many tickers), then fall back to a minimal
// summaryDetail-only query. When everything fails, the caller persists an
// "insufficient_data" row instead of crashing.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const MODULES = [
  "summaryDetail",
  "defaultKeyStatistics",
  "financialData",
  "assetProfile",
  "incomeStatementHistory",
  "balanceSheetHistory",
  "cashflowStatementHistory",
].join(",");

export type FundamentalsRow = {
  symbol: string;
  company_name: string | null;
  sector: string | null;
  industry: string | null;
  market_cap: number | null;
  per: number | null;
  pbv: number | null;
  eps: number | null;
  book_value_per_share: number | null;
  roe: number | null;
  roa: number | null;
  der: number | null;
  revenue: number | null;
  revenue_growth_yoy: number | null;
  net_profit: number | null;
  net_profit_growth_yoy: number | null;
  gross_margin: number | null;
  net_margin: number | null;
  operating_cash_flow: number | null;
  free_cash_flow: number | null;
  dividend_yield: number | null;
  dividend_payout_ratio: number | null;
  historical_per_avg: number | null;
  historical_pbv_avg: number | null;
  sector_per_avg: number | null;
  sector_pbv_avg: number | null;
  sector_roe_avg: number | null;
  financial_report_date: string | null;
  data_source: string;
  raw_payload: any;
};

async function yfQuoteSummary(symbol: string): Promise<any | null> {
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
    symbol,
  )}?modules=${MODULES}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "application/json,text/plain,*/*",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    if (!res.ok) return null;
    const j = await res.json();
    return j?.quoteSummary?.result?.[0] ?? null;
  } catch {
    return null;
  }
}

function num(x: any): number | null {
  if (x == null) return null;
  if (typeof x === "number" && isFinite(x)) return x;
  if (typeof x === "object" && "raw" in x && typeof x.raw === "number") return x.raw;
  return null;
}

function firstStatement<T = any>(arr: any): T | null {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return arr[0] as T;
}

function pctChangeYoY(arr: any[], key: string): number | null {
  if (!Array.isArray(arr) || arr.length < 2) return null;
  const a = num(arr[0]?.[key]);
  const b = num(arr[1]?.[key]);
  if (a == null || b == null || b === 0) return null;
  return (a - b) / Math.abs(b);
}

export async function fetchFundamentalsFromYahoo(
  symbol: string,
): Promise<FundamentalsRow | null> {
  const r = await yfQuoteSummary(symbol);
  if (!r) return null;

  const profile = r.assetProfile ?? {};
  const summary = r.summaryDetail ?? {};
  const stats = r.defaultKeyStatistics ?? {};
  const fin = r.financialData ?? {};
  const income = r.incomeStatementHistory?.incomeStatementHistory ?? [];
  const balance = r.balanceSheetHistory?.balanceSheetStatements ?? [];
  const cash = r.cashflowStatementHistory?.cashflowStatements ?? [];

  const latestIncome = firstStatement<any>(income);
  const latestBalance = firstStatement<any>(balance);
  const latestCash = firstStatement<any>(cash);

  const revenue = num(latestIncome?.totalRevenue);
  const netIncome = num(latestIncome?.netIncome);
  const grossProfit = num(latestIncome?.grossProfit);
  const totalEquity = num(latestBalance?.totalStockholderEquity);
  const totalDebt = num(latestBalance?.totalLiab) ?? num(fin.totalDebt);
  const totalAssets = num(latestBalance?.totalAssets);
  const ocf = num(latestCash?.totalCashFromOperatingActivities) ?? num(fin.operatingCashflow);
  const capex = num(latestCash?.capitalExpenditures);
  const fcf =
    num(fin.freeCashflow) ??
    (ocf != null && capex != null ? ocf + capex /* capex usually negative */ : null);

  const dividendsPaid = num(latestCash?.dividendsPaid);
  const payoutRatio =
    netIncome && netIncome !== 0 && dividendsPaid != null
      ? Math.min(2, Math.abs(dividendsPaid) / Math.abs(netIncome))
      : num(summary.payoutRatio);

  return {
    symbol: symbol.toUpperCase(),
    company_name: profile.longBusinessSummary ? null : null, // longBusinessSummary too long
    sector: profile.sector ?? null,
    industry: profile.industry ?? null,
    market_cap: num(summary.marketCap) ?? num(stats.enterpriseValue),
    per: num(summary.trailingPE) ?? num(stats.forwardPE),
    pbv: num(stats.priceToBook),
    eps: num(stats.trailingEps),
    book_value_per_share: num(stats.bookValue),
    roe: num(fin.returnOnEquity),
    roa: num(fin.returnOnAssets),
    der:
      totalDebt != null && totalEquity != null && totalEquity !== 0
        ? totalDebt / totalEquity
        : num(fin.debtToEquity)
        ? Number(fin.debtToEquity.raw ?? fin.debtToEquity) / 100
        : null,
    revenue,
    revenue_growth_yoy: pctChangeYoY(income, "totalRevenue") ?? num(fin.revenueGrowth),
    net_profit: netIncome,
    net_profit_growth_yoy: pctChangeYoY(income, "netIncome") ?? num(fin.earningsGrowth),
    gross_margin:
      grossProfit != null && revenue ? grossProfit / revenue : num(fin.grossMargins),
    net_margin: netIncome != null && revenue ? netIncome / revenue : num(fin.profitMargins),
    operating_cash_flow: ocf,
    free_cash_flow: fcf,
    dividend_yield: num(summary.dividendYield) ?? num(summary.trailingAnnualDividendYield),
    dividend_payout_ratio: payoutRatio,
    historical_per_avg: null,
    historical_pbv_avg: null,
    sector_per_avg: null,
    sector_pbv_avg: null,
    sector_roe_avg: null,
    financial_report_date: latestIncome?.endDate?.fmt ?? null,
    data_source: "yahoo_quote_summary",
    raw_payload: { stats, summary, fin, profile },
  };
}

const STALE_AFTER_MS = 7 * 24 * 3600_000;

export async function getFundamentals(
  symbol: string,
  opts: { forceRefresh?: boolean } = {},
): Promise<FundamentalsRow | null> {
  const sym = symbol.toUpperCase();
  if (!opts.forceRefresh) {
    const { data: existing } = await supabaseAdmin
      .from("stock_fundamentals")
      .select("*")
      .eq("symbol", sym)
      .maybeSingle();
    if (existing) {
      const age = Date.now() - new Date(existing.data_freshness as any).getTime();
      if (age < STALE_AFTER_MS) return existing as unknown as FundamentalsRow;
    }
  }

  const fresh = await fetchFundamentalsFromYahoo(sym);
  if (!fresh) {
    // Return whatever we have (possibly stale) so the scorer can still report
    // sector-relative + insufficient_data instead of a hard crash.
    const { data: stale } = await supabaseAdmin
      .from("stock_fundamentals")
      .select("*")
      .eq("symbol", sym)
      .maybeSingle();
    return (stale as unknown as FundamentalsRow) ?? null;
  }

  await supabaseAdmin
    .from("stock_fundamentals")
    .upsert(
      { ...fresh, data_freshness: new Date().toISOString() },
      { onConflict: "symbol" },
    );

  return fresh;
}

/** Compute sector benchmarks from all stored fundamentals (cheap aggregate). */
export async function getSectorBenchmarks(sector: string | null): Promise<{
  per: number | null;
  pbv: number | null;
  roe: number | null;
}> {
  if (!sector) return { per: null, pbv: null, roe: null };
  const { data } = await supabaseAdmin
    .from("stock_fundamentals")
    .select("per, pbv, roe")
    .eq("sector", sector);
  const rows = data ?? [];
  const avg = (key: "per" | "pbv" | "roe") => {
    const xs = rows.map((r: any) => Number(r[key])).filter((n) => Number.isFinite(n) && n > 0);
    if (!xs.length) return null;
    return xs.reduce((s, n) => s + n, 0) / xs.length;
  };
  return { per: avg("per"), pbv: avg("pbv"), roe: avg("roe") };
}
