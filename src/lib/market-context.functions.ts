import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { symbolMarket } from "./symbols";
import { sectorOf, peerBasket } from "./sectors";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function yf(url: string) {
  const r = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`yf ${r.status}`);
  return r.json();
}

type Bar = { t: number; c: number };

async function fetchDaily(symbol: string, range = "3mo"): Promise<Bar[]> {
  try {
    const r = await yf(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`,
    );
    const res = r?.chart?.result?.[0];
    const ts: number[] = res?.timestamp ?? [];
    const closes: (number | null)[] = res?.indicators?.quote?.[0]?.close ?? [];
    const out: Bar[] = [];
    for (let i = 0; i < ts.length; i++) {
      const c = closes[i];
      if (c != null && Number.isFinite(c)) out.push({ t: ts[i], c });
    }
    return out;
  } catch {
    return [];
  }
}

function pctChange(bars: Bar[], lookback: number): number | null {
  if (bars.length <= lookback) return null;
  const last = bars[bars.length - 1].c;
  const prev = bars[bars.length - 1 - lookback].c;
  if (!prev) return null;
  return ((last - prev) / prev) * 100;
}

function dailyReturns(bars: Bar[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const p = bars[i - 1].c, c = bars[i].c;
    if (p) out.push((c - p) / p);
  }
  return out;
}

function alignReturns(a: Bar[], b: Bar[]) {
  const map = new Map(b.map((x) => [x.t, x.c]));
  const ra: number[] = [], rb: number[] = [];
  let prevA: number | null = null, prevB: number | null = null;
  for (const x of a) {
    const y = map.get(x.t);
    if (y == null) { prevA = x.c; prevB = null; continue; }
    if (prevA != null && prevB != null) {
      ra.push((x.c - prevA) / prevA);
      rb.push((y - prevB) / prevB);
    }
    prevA = x.c; prevB = y;
  }
  return { ra, rb };
}

function mean(x: number[]) { return x.length ? x.reduce((s, v) => s + v, 0) / x.length : 0; }
function variance(x: number[]) {
  const m = mean(x);
  return x.length ? x.reduce((s, v) => s + (v - m) * (v - m), 0) / x.length : 0;
}
function covariance(a: number[], b: number[]) {
  const ma = mean(a), mb = mean(b);
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += (a[i] - ma) * (b[i] - mb);
  return n ? s / n : 0;
}

function trendOf(bars: Bar[]): "uptrend" | "downtrend" | "sideways" | "n/a" {
  if (bars.length < 30) return "n/a";
  const closes = bars.map((b) => b.c);
  const last = closes[closes.length - 1];
  const sma20 = closes.slice(-20).reduce((s, v) => s + v, 0) / 20;
  const sma50 = closes.slice(-50 || -closes.length).reduce((s, v) => s + v, 0) /
    Math.min(50, closes.length);
  if (last > sma20 && sma20 > sma50) return "uptrend";
  if (last < sma20 && sma20 < sma50) return "downtrend";
  return "sideways";
}

const SECTOR_ETF: Record<string, string> = {
  Tech: "XLK", Financials: "XLF", Energy: "XLE", Consumer: "XLY",
  Healthcare: "XLV", Industrials: "XLI", Materials: "XLB",
  Telecom: "XLC", RealEstate: "XLRE", Utilities: "XLU",
};

export type MarketContext = {
  symbol: string;
  market: "idx" | "us";
  benchmark: { symbol: string; name: string; trend: ReturnType<typeof trendOf>; change20d: number | null };
  sector: { name: string; proxy: string | null; trend: ReturnType<typeof trendOf>; change20d: number | null };
  relativeStrength: { vsBenchmark: number | null; vsSector: number | null };
  beta: number | null;
  correlation: number | null;
  session: "open" | "closed" | "premarket" | "afterhours" | "unknown";
  notes: string[];
  summary: string;
  alignment: "supportive" | "mixed" | "headwind" | "n/a";
};

export const getMarketContext = createServerFn({ method: "POST" })
  .inputValidator((d: { symbol: string }) =>
    z.object({ symbol: z.string().min(1) }).parse(d),
  )
  .handler(async ({ data }): Promise<MarketContext> => {
    const sym = data.symbol.toUpperCase();
    const market = symbolMarket(sym) === "idx" ? "idx" : "us";
    const benchSym = market === "idx" ? "^JKSE" : "^GSPC";
    const benchName = market === "idx" ? "IHSG (Jakarta Composite)" : "S&P 500";
    const sector = sectorOf(sym);
    const sectorProxy = market === "us" ? SECTOR_ETF[sector] ?? null : null;
    // For IDX, no liquid sector ETF exists — synthesize a peer basket of up to 5 same-sector LQ80 names.
    const peers = market === "idx" ? peerBasket(sym, 5) : [];
    const usePeerBasket = market === "idx" && peers.length >= 2;

    const [stockBars, benchBars, sectorBars, peerBars] = await Promise.all([
      fetchDaily(sym),
      fetchDaily(benchSym),
      sectorProxy ? fetchDaily(sectorProxy) : Promise.resolve([] as Bar[]),
      usePeerBasket ? Promise.all(peers.map((p) => fetchDaily(p))) : Promise.resolve([] as Bar[][]),
    ]);

    // Build synthetic IDX peer-basket bars: equal-weight average of normalized closes.
    let basketBars: Bar[] = sectorBars;
    if (usePeerBasket) {
      const valid = (peerBars as Bar[][]).filter((arr) => arr.length >= 30);
      if (valid.length >= 2) {
        // Normalize each series to its first close, then average.
        const minLen = Math.min(...valid.map((a) => a.length));
        const normed = valid.map((arr) => {
          const start = arr[arr.length - minLen];
          const base = start?.c || 1;
          return arr.slice(-minLen).map((b) => ({ t: b.t, c: b.c / base }));
        });
        basketBars = [];
        for (let i = 0; i < minLen; i++) {
          let sum = 0;
          for (const arr of normed) sum += arr[i].c;
          basketBars.push({ t: normed[0][i].t, c: sum / normed.length });
        }
      }
    }

    const stock20 = pctChange(stockBars, 20);
    const bench20 = pctChange(benchBars, 20);
    const sector20 = pctChange(basketBars, 20);

    // Beta vs benchmark
    let beta: number | null = null, corr: number | null = null;
    if (stockBars.length > 30 && benchBars.length > 30) {
      const { ra, rb } = alignReturns(stockBars, benchBars);
      const vb = variance(rb);
      if (vb > 0) {
        beta = +(covariance(ra, rb) / vb).toFixed(2);
        const va = variance(ra);
        if (va > 0) corr = +(covariance(ra, rb) / Math.sqrt(va * vb)).toFixed(2);
      }
    }

    const benchTrend = trendOf(benchBars);
    const sectorTrend = trendOf(sectorBars);

    const rsVsBench = stock20 != null && bench20 != null ? +(stock20 - bench20).toFixed(2) : null;
    const rsVsSector = stock20 != null && sector20 != null ? +(stock20 - sector20).toFixed(2) : null;

    // Session inference (rough: weekday + hour in market timezone)
    const now = new Date();
    const day = now.getUTCDay();
    let session: MarketContext["session"] = "unknown";
    if (market === "us") {
      // NYSE 14:30-21:00 UTC (ignoring DST)
      const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
      if (day >= 1 && day <= 5) {
        if (utcMin >= 14 * 60 + 30 && utcMin < 21 * 60) session = "open";
        else if (utcMin >= 9 * 60 && utcMin < 14 * 60 + 30) session = "premarket";
        else if (utcMin >= 21 * 60 && utcMin < 24 * 60) session = "afterhours";
        else session = "closed";
      } else session = "closed";
    } else {
      // IDX 02:00-08:00 UTC (Mon-Fri)
      const utcMin = now.getUTCHours() * 60 + now.getUTCMinutes();
      if (day >= 1 && day <= 5 && utcMin >= 2 * 60 && utcMin < 8 * 60) session = "open";
      else session = "closed";
    }

    const notes: string[] = [];
    if (stockBars.length < 30) notes.push("Limited daily history for the stock");
    if (benchBars.length < 30) notes.push("Limited benchmark history");
    if (!sectorProxy) notes.push("No sector proxy available — using benchmark only");

    // Alignment summary
    let supportiveCount = 0, headwindCount = 0;
    if (benchTrend === "uptrend") supportiveCount++;
    if (benchTrend === "downtrend") headwindCount++;
    if (sectorTrend === "uptrend") supportiveCount++;
    if (sectorTrend === "downtrend") headwindCount++;
    if (rsVsBench != null && rsVsBench > 1) supportiveCount++;
    if (rsVsBench != null && rsVsBench < -1) headwindCount++;

    let alignment: MarketContext["alignment"] = "n/a";
    if (benchBars.length >= 30) {
      if (supportiveCount >= 2 && headwindCount === 0) alignment = "supportive";
      else if (headwindCount >= 2 && supportiveCount === 0) alignment = "headwind";
      else alignment = "mixed";
    }

    const summary =
      alignment === "supportive"
        ? `Market & sector mendukung — ${benchName} ${benchTrend}, sektor ${sector} ${sectorTrend}.`
        : alignment === "headwind"
        ? `Konteks market melawan — ${benchName} ${benchTrend}${sectorProxy ? `, sektor ${sector} ${sectorTrend}` : ""}.`
        : alignment === "mixed"
        ? `Konteks market campur — perhatikan tren ${benchName} (${benchTrend}) sebelum eksekusi.`
        : "Data konteks market belum cukup.";

    return {
      symbol: sym,
      market,
      benchmark: { symbol: benchSym, name: benchName, trend: benchTrend, change20d: bench20 != null ? +bench20.toFixed(2) : null },
      sector: { name: sector, proxy: sectorProxy, trend: sectorTrend, change20d: sector20 != null ? +sector20.toFixed(2) : null },
      relativeStrength: { vsBenchmark: rsVsBench, vsSector: rsVsSector },
      beta,
      correlation: corr,
      session,
      notes,
      summary,
      alignment,
    };
  });
