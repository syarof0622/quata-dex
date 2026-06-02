// Update 14 — Fallback fundamental extractor that mines ratios from
// already-stored news_articles. Used when Twelve Data + SerpApi return
// nothing (e.g. quota exhausted, IDX symbol unsupported on free plans).
//
// Strategy:
//   1. Pull last 120 days of news for the symbol (primary_ticker or tickers[]).
//   2. Scan title + summary + raw_payload.description with Indonesian/English
//      regex patterns for PER, PBV, ROE, ROA, DER, dividend yield, NPM, EPS.
//   3. Aggregate by median across articles (resilient to outliers/typos).
//   4. Return a RawValuationMetrics with source="news_mined" and the most
//      recent supporting article URL.
//
// Pure regex — no AI cost. Skips silently if no ratio is found so the caller
// can still log INSUFFICIENT_DATA.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { RawValuationMetrics } from "./fundamental-sources.server";

type Ratio = "per" | "pbv" | "roe" | "roa" | "der" | "dividend_yield" | "npm";

// Indonesian numbers may use "," as decimal sep and "." as thousand sep.
// We treat the first separator before 1-2 trailing digits as decimal.
function parseIdNumber(raw: string): number | null {
  if (!raw) return null;
  let s = raw.trim().replace(/\s+/g, "");
  // strip trailing units like "x", "kali", "%"
  s = s.replace(/(x|kali|%)$/i, "");
  // if both "," and "." present, assume "." = thousand, "," = decimal
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// Each pattern captures the numeric token (e.g. "12,5" or "1.25").
// Order matters — longer labels first to avoid partial matches.
const PATTERNS: Record<Ratio, RegExp[]> = {
  per: [
    /\b(?:PER|P\/E(?:\s*ratio)?|price[-\s]?to[-\s]?earnings|rasio\s+harga\s+terhadap\s+laba)\s*(?:sebesar|di|of|=|:)?\s*([0-9]+(?:[.,][0-9]+)?)\s*(?:x|kali)?/gi,
  ],
  pbv: [
    /\b(?:PBV|P\/BV?|price[-\s]?to[-\s]?book(?:\s*value)?|rasio\s+harga\s+terhadap\s+nilai\s+buku)\s*(?:sebesar|di|of|=|:)?\s*([0-9]+(?:[.,][0-9]+)?)\s*(?:x|kali)?/gi,
  ],
  roe: [
    /\b(?:ROE|return[-\s]?on[-\s]?equity|imbal\s+hasil\s+ekuitas)\s*(?:sebesar|di|of|=|:)?\s*([0-9]+(?:[.,][0-9]+)?)\s*%/gi,
  ],
  roa: [
    /\b(?:ROA|return[-\s]?on[-\s]?assets?)\s*(?:sebesar|di|of|=|:)?\s*([0-9]+(?:[.,][0-9]+)?)\s*%/gi,
  ],
  der: [
    /\b(?:DER|debt[-\s]?to[-\s]?equity(?:\s*ratio)?|rasio\s+utang\s+terhadap\s+ekuitas)\s*(?:sebesar|di|of|=|:)?\s*([0-9]+(?:[.,][0-9]+)?)\s*(?:x|kali)?/gi,
  ],
  dividend_yield: [
    /\b(?:dividend\s*yield|yield\s+dividen|imbal\s+hasil\s+dividen)\s*(?:sebesar|di|of|=|:)?\s*([0-9]+(?:[.,][0-9]+)?)\s*%/gi,
  ],
  npm: [
    /\b(?:NPM|net\s*profit\s*margin|margin\s+laba\s+bersih)\s*(?:sebesar|di|of|=|:)?\s*([0-9]+(?:[.,][0-9]+)?)\s*%/gi,
  ],
};

// Plausibility guards — drop crazy matches (e.g. "20%" being a market move,
// not ROE). Conservative bounds tuned for IDX equities.
const BOUNDS: Record<Ratio, [number, number]> = {
  per: [0.5, 500],
  pbv: [0.05, 50],
  roe: [-100, 100],
  roa: [-50, 50],
  der: [0, 20],
  dividend_yield: [0, 30],
  npm: [-100, 80],
};

function extractRatios(text: string): Partial<Record<Ratio, number[]>> {
  const out: Partial<Record<Ratio, number[]>> = {};
  for (const k of Object.keys(PATTERNS) as Ratio[]) {
    for (const re of PATTERNS[k]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        const n = parseIdNumber(m[1]);
        if (n == null) continue;
        const [lo, hi] = BOUNDS[k];
        if (n < lo || n > hi) continue;
        (out[k] ??= []).push(n);
      }
    }
  }
  return out;
}

function median(arr: number[]): number | null {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export async function fetchFundamentalFromNews(
  symbol: string,
): Promise<RawValuationMetrics | null> {
  const sym = symbol.toUpperCase();
  const base = sym.replace(/\.JK$/i, "");
  const since = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("news_articles")
    .select("title, summary, url, published_at, raw_payload, primary_ticker, tickers")
    .or(
      `primary_ticker.eq.${sym},primary_ticker.eq.${base},tickers.cs.{${sym}},tickers.cs.{${base}}`,
    )
    .gte("published_at", since)
    .order("published_at", { ascending: false })
    .limit(200);

  if (error || !data || data.length === 0) return null;

  const buckets: Partial<Record<Ratio, number[]>> = {};
  let mostRecentUrl: string | null = null;
  let mostRecentDate: string | null = null;
  let articlesWithMatch = 0;

  for (const a of data) {
    const desc =
      (a.raw_payload as any)?.description ??
      (a.raw_payload as any)?.content ??
      "";
    const text = `${a.title ?? ""}\n${a.summary ?? ""}\n${desc}`;
    if (!text.trim()) continue;
    const ratios = extractRatios(text);
    let matched = false;
    for (const k of Object.keys(ratios) as Ratio[]) {
      const vals = ratios[k];
      if (!vals?.length) continue;
      matched = true;
      (buckets[k] ??= []).push(...vals);
    }
    if (matched) {
      articlesWithMatch++;
      if (!mostRecentDate || (a.published_at && a.published_at > mostRecentDate)) {
        mostRecentDate = a.published_at;
        mostRecentUrl = a.url;
      }
    }
  }

  // Need at least one substantive ratio (PER/PBV/ROE/DER/dividend yield)
  // before we return — otherwise it's not worth labeling as a source.
  const substantive = ["per", "pbv", "roe", "der", "dividend_yield"] as const;
  const hasSubstantive = substantive.some((k) => (buckets[k]?.length ?? 0) > 0);
  if (!hasSubstantive) return null;

  return {
    symbol: sym,
    sector: null,
    price: null,
    market_cap: null,
    shares_outstanding: null,
    source: "news_mined",
    source_url: mostRecentUrl,
    per: median(buckets.per ?? []),
    pbv: median(buckets.pbv ?? []),
    ps: null,
    ev_ebitda: null,
    dividend_yield: median(buckets.dividend_yield ?? []),
    dividend_per_share: null,
    roe: median(buckets.roe ?? []),
    roa: median(buckets.roa ?? []),
    npm: median(buckets.npm ?? []),
    gpm: null,
    opm: null,
    der: median(buckets.der ?? []),
    debt_to_assets: null,
    eps_growth_yoy: null,
    revenue_growth_yoy: null,
    net_income_growth_yoy: null,
    fcf_yield: null,
    operating_cashflow_margin: null,
    payout_ratio: null,
    calculation_method: "news_regex_median_v1",
    raw_payload: {
      articles_scanned: data.length,
      articles_with_match: articlesWithMatch,
      most_recent_url: mostRecentUrl,
      most_recent_date: mostRecentDate,
      sample_counts: Object.fromEntries(
        (Object.keys(buckets) as Ratio[]).map((k) => [k, buckets[k]?.length ?? 0]),
      ),
    },
  };
}
