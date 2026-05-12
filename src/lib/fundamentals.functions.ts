import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Worker-safe Yahoo Finance fundamentals via direct quoteSummary fetch.
// The v10 endpoint requires a crumb + cookie; we fetch & cache them per-runtime.

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

let crumbCache: { crumb: string; cookie: string; expires: number } | null = null;

async function getCrumb(): Promise<{ crumb: string; cookie: string }> {
  if (crumbCache && crumbCache.expires > Date.now()) return crumbCache;
  // Step 1: fetch a session cookie
  const r1 = await fetch("https://fc.yahoo.com", {
    headers: { "User-Agent": UA },
    redirect: "manual",
  });
  const setCookie = r1.headers.get("set-cookie") ?? "";
  const cookie = setCookie.split(";")[0] ?? "";
  // Step 2: fetch crumb
  const r2 = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
    headers: { "User-Agent": UA, Cookie: cookie },
  });
  const crumb = (await r2.text()).trim();
  if (!crumb || crumb.length > 32) throw new Error("crumb fetch failed");
  crumbCache = { crumb, cookie, expires: Date.now() + 30 * 60_000 };
  return crumbCache;
}

const cache = new Map<string, { data: any; expires: number }>();
async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.data as T;
  const data = await fn();
  cache.set(key, { data, expires: Date.now() + ttlMs });
  return data;
}

const FUND_MODULES = [
  "assetProfile",
  "summaryDetail",
  "defaultKeyStatistics",
  "financialData",
  "price",
  "incomeStatementHistory",
  "balanceSheetHistory",
  "cashflowStatementHistory",
  "earnings",
  "calendarEvents",
  "recommendationTrend",
] as const;

async function fetchFundamentals(symbol: string): Promise<any | null> {
  let crumb = "";
  let cookie = "";
  try {
    const c = await getCrumb();
    crumb = c.crumb;
    cookie = c.cookie;
  } catch {
    // proceed crumbless — sometimes works for query1
  }
  const url =
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}` +
    `?modules=${FUND_MODULES.join(",")}` +
    (crumb ? `&crumb=${encodeURIComponent(crumb)}` : "");
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });
  if (!res.ok) {
    // Reset crumb so next call retries
    crumbCache = null;
    return null;
  }
  const j = await res.json();
  return j?.quoteSummary?.result?.[0] ?? null;
}

const num = (v: any): number | null =>
  v == null ? null : typeof v === "number" ? v : typeof v?.raw === "number" ? v.raw : null;
const fmt = (v: any): string | null =>
  v == null ? null : typeof v === "string" ? v : typeof v?.fmt === "string" ? v.fmt : null;

export type FundamentalDTO = {
  symbol: string;
  profile: {
    longName: string | null;
    sector: string | null;
    industry: string | null;
    country: string | null;
    website: string | null;
    fullTimeEmployees: number | null;
    summary: string | null;
  };
  price: {
    currency: string | null;
    marketCap: number | null;
    regularMarketPrice: number | null;
  };
  valuation: {
    trailingPE: number | null;
    forwardPE: number | null;
    pegRatio: number | null;
    priceToBook: number | null;
    priceToSales: number | null;
    enterpriseToEbitda: number | null;
    enterpriseToRevenue: number | null;
  };
  profitability: {
    profitMargin: number | null;
    operatingMargin: number | null;
    grossMargin: number | null;
    returnOnEquity: number | null;
    returnOnAssets: number | null;
    ebitdaMargin: number | null;
  };
  growth: {
    revenueGrowth: number | null;
    earningsGrowth: number | null;
    earningsQuarterlyGrowth: number | null;
  };
  health: {
    totalCash: number | null;
    totalDebt: number | null;
    debtToEquity: number | null;
    currentRatio: number | null;
    quickRatio: number | null;
    freeCashflow: number | null;
    operatingCashflow: number | null;
  };
  dividends: {
    dividendRate: number | null;
    dividendYield: number | null;
    payoutRatio: number | null;
    exDividendDate: string | null;
  };
  earnings: {
    nextEarningsDate: string | null;
    epsTrailing: number | null;
    epsForward: number | null;
    epsRevisionsUp: number | null;
    epsRevisionsDown: number | null;
  };
  recommendation: {
    mean: number | null;
    key: string | null;
    targetMean: number | null;
    targetHigh: number | null;
    targetLow: number | null;
    numAnalysts: number | null;
  };
  statements: {
    income: Array<{ date: string; revenue: number | null; netIncome: number | null; grossProfit: number | null; operatingIncome: number | null }>;
    balance: Array<{ date: string; totalAssets: number | null; totalLiab: number | null; totalEquity: number | null; cash: number | null }>;
    cashflow: Array<{ date: string; operating: number | null; investing: number | null; financing: number | null; capex: number | null }>;
  };
  asOf: string;
};

function toEpoch(d: any): string | null {
  const n = num(d);
  if (n == null) return null;
  // raw epoch seconds
  return new Date(n * 1000).toISOString();
}

function map(result: any, symbol: string): FundamentalDTO {
  const ap = result?.assetProfile ?? {};
  const sd = result?.summaryDetail ?? {};
  const ks = result?.defaultKeyStatistics ?? {};
  const fd = result?.financialData ?? {};
  const pr = result?.price ?? {};
  const inc = result?.incomeStatementHistory?.incomeStatementHistory ?? [];
  const bs = result?.balanceSheetHistory?.balanceSheetStatements ?? [];
  const cf = result?.cashflowStatementHistory?.cashflowStatements ?? [];
  const earn = result?.earnings ?? {};
  const cal = result?.calendarEvents ?? {};
  const rec = result?.recommendationTrend?.trend?.[0] ?? {};

  const earnDates: any[] = cal?.earnings?.earningsDate ?? [];
  const nextEarn = earnDates.length ? toEpoch(earnDates[0]) : null;

  return {
    symbol,
    profile: {
      longName: pr?.longName ?? ap?.longBusinessSummary ? (pr?.longName ?? null) : (pr?.shortName ?? null),
      sector: ap?.sector ?? null,
      industry: ap?.industry ?? null,
      country: ap?.country ?? null,
      website: ap?.website ?? null,
      fullTimeEmployees: num(ap?.fullTimeEmployees),
      summary: ap?.longBusinessSummary ?? null,
    },
    price: {
      currency: pr?.currency ?? sd?.currency ?? null,
      marketCap: num(pr?.marketCap) ?? num(sd?.marketCap),
      regularMarketPrice: num(pr?.regularMarketPrice),
    },
    valuation: {
      trailingPE: num(sd?.trailingPE) ?? num(ks?.trailingPE),
      forwardPE: num(sd?.forwardPE) ?? num(ks?.forwardPE),
      pegRatio: num(ks?.pegRatio),
      priceToBook: num(ks?.priceToBook),
      priceToSales: num(sd?.priceToSalesTrailing12Months) ?? num(ks?.priceToSalesTrailing12Months),
      enterpriseToEbitda: num(ks?.enterpriseToEbitda),
      enterpriseToRevenue: num(ks?.enterpriseToRevenue),
    },
    profitability: {
      profitMargin: num(fd?.profitMargins) ?? num(ks?.profitMargins),
      operatingMargin: num(fd?.operatingMargins),
      grossMargin: num(fd?.grossMargins),
      returnOnEquity: num(fd?.returnOnEquity),
      returnOnAssets: num(fd?.returnOnAssets),
      ebitdaMargin: num(fd?.ebitdaMargins),
    },
    growth: {
      revenueGrowth: num(fd?.revenueGrowth),
      earningsGrowth: num(fd?.earningsGrowth),
      earningsQuarterlyGrowth: num(ks?.earningsQuarterlyGrowth),
    },
    health: {
      totalCash: num(fd?.totalCash),
      totalDebt: num(fd?.totalDebt),
      debtToEquity: num(fd?.debtToEquity),
      currentRatio: num(fd?.currentRatio),
      quickRatio: num(fd?.quickRatio),
      freeCashflow: num(fd?.freeCashflow),
      operatingCashflow: num(fd?.operatingCashflow),
    },
    dividends: {
      dividendRate: num(sd?.dividendRate),
      dividendYield: num(sd?.dividendYield),
      payoutRatio: num(sd?.payoutRatio),
      exDividendDate: toEpoch(sd?.exDividendDate),
    },
    earnings: {
      nextEarningsDate: nextEarn,
      epsTrailing: num(ks?.trailingEps),
      epsForward: num(ks?.forwardEps),
      epsRevisionsUp: num(earn?.earningsChart?.earningsEstimate?.upRevisions),
      epsRevisionsDown: num(earn?.earningsChart?.earningsEstimate?.downRevisions),
    },
    recommendation: {
      mean: num(fd?.recommendationMean),
      key: fd?.recommendationKey ?? null,
      targetMean: num(fd?.targetMeanPrice),
      targetHigh: num(fd?.targetHighPrice),
      targetLow: num(fd?.targetLowPrice),
      numAnalysts: num(fd?.numberOfAnalystOpinions),
    },
    statements: {
      income: inc.slice(0, 4).map((r: any) => ({
        date: fmt(r?.endDate) ?? "",
        revenue: num(r?.totalRevenue),
        netIncome: num(r?.netIncome),
        grossProfit: num(r?.grossProfit),
        operatingIncome: num(r?.operatingIncome),
      })),
      balance: bs.slice(0, 4).map((r: any) => ({
        date: fmt(r?.endDate) ?? "",
        totalAssets: num(r?.totalAssets),
        totalLiab: num(r?.totalLiab),
        totalEquity: num(r?.totalStockholderEquity),
        cash: num(r?.cash),
      })),
      cashflow: cf.slice(0, 4).map((r: any) => ({
        date: fmt(r?.endDate) ?? "",
        operating: num(r?.totalCashFromOperatingActivities),
        investing: num(r?.totalCashflowsFromInvestingActivities),
        financing: num(r?.totalCashFromFinancingActivities),
        capex: num(r?.capitalExpenditures),
      })),
    },
    asOf: new Date().toISOString(),
  };
}

export const getFundamentals = createServerFn({ method: "POST" })
  .inputValidator((d: { symbol: string }) =>
    z.object({ symbol: z.string().min(1).max(20) }).parse(d),
  )
  .handler(async ({ data }) => {
    const key = `fund:${data.symbol}`;
    return cached<FundamentalDTO | null>(key, 10 * 60_000, async () => {
      try {
        const r = await fetchFundamentals(data.symbol);
        if (!r) return null;
        return map(r, data.symbol);
      } catch (e) {
        console.error("getFundamentals", data.symbol, e);
        return null;
      }
    });
  });
