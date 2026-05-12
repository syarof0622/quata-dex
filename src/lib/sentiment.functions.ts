import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getCandles, getNews, getQuote } from "./market.functions";
import { sectorOf } from "./sectors";
import type { Candle } from "./indicators";
import { obv } from "./indicators";

// Heuristic smart-money / institutional flow detection.
export const smartMoney = createServerFn({ method: "POST" })
  .inputValidator((d: { symbol: string }) => z.object({ symbol: z.string().min(1).toUpperCase() }).parse(d))
  .handler(async ({ data }) => {
    const candles = (await getCandles({ data: { symbol: data.symbol, timeframe: "1d" } })) as Candle[];
    if (candles.length < 30) return { score: 0, label: "Neutral", flow: "balanced", details: ["Not enough data"] };
    const recent = candles.slice(-30);
    const upVol = recent.filter(c => c.close > c.open).reduce((a, c) => a + c.volume, 0);
    const dnVol = recent.filter(c => c.close < c.open).reduce((a, c) => a + c.volume, 0);
    const ratio = dnVol === 0 ? 99 : upVol / dnVol;

    const obvs = obv(candles);
    const recentObv = obvs.slice(-10).reduce((a, b) => a + b, 0) / 10;
    const priorObv = obvs.slice(-20, -10).reduce((a, b) => a + b, 0) / 10;
    const obvSlope = recentObv - priorObv;

    const vols = recent.map(c => c.volume).sort((a, b) => a - b);
    const median = vols[Math.floor(vols.length / 2)];
    const largeBuy = recent.filter(c => c.volume > median * 1.8 && c.close > c.open).length;
    const largeSell = recent.filter(c => c.volume > median * 1.8 && c.close < c.open).length;

    let score = 0;
    score += ratio > 1.3 ? 25 : ratio < 0.7 ? -25 : 0;
    score += obvSlope > 0 ? 20 : -20;
    score += (largeBuy - largeSell) * 8;
    score = Math.max(-100, Math.min(100, score));

    const label = score > 40 ? "Strong Accumulation" : score > 15 ? "Accumulation" : score < -40 ? "Strong Distribution" : score < -15 ? "Distribution" : "Neutral";
    const flow = score > 15 ? "buying pressure" : score < -15 ? "selling pressure" : "balanced";
    return {
      score, label, flow,
      details: [
        `Up/Down volume ratio: ${ratio.toFixed(2)}`,
        `OBV slope: ${obvSlope > 0 ? "rising" : "falling"}`,
        `Large bars: ${largeBuy} buy / ${largeSell} sell`,
      ],
      stats: { upVol, dnVol, ratio, obvSlope, largeBuy, largeSell },
    };
  });

// Lightweight sentiment from news headlines using keyword scoring + symbol relevance.
const POSITIVE = ["beat","beats","surge","surges","rally","rallies","upgrade","upgraded","record","strong","growth","profit","gain","gains","outperform","bullish","raised","jumps","jump","soar","soars","wins","win","approval","dividend","buyback"];
const NEGATIVE = ["miss","misses","plunge","plunges","drop","drops","downgrade","downgraded","loss","losses","weak","decline","declines","cut","cuts","bearish","fall","falls","slumps","slump","probe","lawsuit","fraud","layoff","layoffs","recall","ban","investigation","warning","fine","delay","bankruptcy","default"];

// Sector-level keywords used to gauge contextual relevance.
const SECTOR_KEYWORDS: Record<string, string[]> = {
  Energy: ["coal","oil","gas","energy","batu bara","tambang","mining","opec","crude","brent","wti"],
  Financials: ["bank","banking","loan","credit","interest rate","fed","ojk","financial"],
  Technology: ["tech","software","cloud","ai","chip","semiconductor","internet"],
  Materials: ["nickel","copper","gold","steel","commodity","mining","tambang"],
  "Consumer Staples": ["consumer","retail","food","beverage","fmcg"],
  Healthcare: ["pharma","health","biotech","drug","clinical","fda"],
  Communication: ["telecom","media","network"],
  Industrials: ["construction","logistics","industrial","manufacturing"],
  "Real Estate": ["property","real estate","reit","housing"],
  Utilities: ["utility","power","electric","plt"],
};

function tokenize(s: string): string[] {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9\s.\-]/g, " ").split(/\s+/).filter(Boolean);
}

function buildRelevanceTerms(symbol: string, name?: string | null): { strong: string[]; weak: string[] } {
  const sym = symbol.toUpperCase();
  const base = sym.replace(/\..+$/, ""); // BUMI from BUMI.JK
  const strong = new Set<string>([sym.toLowerCase(), base.toLowerCase()]);
  if (name) {
    // First 1-2 meaningful words of company name (e.g. "Bumi Resources Tbk" → bumi, resources)
    const words = tokenize(name).filter(w => w.length > 2 && !/^(tbk|inc|ltd|plc|corp|company|the|and)$/.test(w));
    words.slice(0, 3).forEach(w => strong.add(w));
  }
  const sector = sectorOf(sym);
  const weak = sector ? SECTOR_KEYWORDS[sector] ?? [] : [];
  return { strong: [...strong], weak };
}

function scoreRelevance(title: string, terms: { strong: string[]; weak: string[] }): {
  score: number;            // 0..100
  band: "High" | "Medium" | "Low" | "Unrelated";
} {
  const t = (title ?? "").toLowerCase();
  let score = 0;
  for (const w of terms.strong) if (w && t.includes(w)) score += 50;
  for (const w of terms.weak) if (w && t.includes(w)) score += 15;
  score = Math.min(100, score);
  const band: "High" | "Medium" | "Low" | "Unrelated" =
    score >= 50 ? "High" : score >= 25 ? "Medium" : score > 0 ? "Low" : "Unrelated";
  return { score, band };
}

export const newsSentiment = createServerFn({ method: "POST" })
  .inputValidator((d: { symbol?: string }) => z.object({ symbol: z.string().optional() }).parse(d ?? {}))
  .handler(async ({ data }) => {
    const news = (await getNews({ data: { symbol: data.symbol } })) as
      { title: string; link: string; publisher?: string; publishedAt?: string | null; thumbnail?: string | null }[];

    let terms: { strong: string[]; weak: string[] } = { strong: [], weak: [] };
    if (data.symbol) {
      const q = await getQuote({ data: { symbol: data.symbol } }).catch(() => null);
      terms = buildRelevanceTerms(data.symbol, q?.shortName ?? null);
    }

    const scored = news.map(n => {
      const t = (n.title ?? "").toLowerCase();
      const p = POSITIVE.reduce((a, w) => a + (t.includes(w) ? 1 : 0), 0);
      const ng = NEGATIVE.reduce((a, w) => a + (t.includes(w) ? 1 : 0), 0);
      const polarity = p - ng;
      const sentiment = polarity > 0 ? "positive" : polarity < 0 ? "negative" : "neutral";
      const rel = data.symbol ? scoreRelevance(n.title, terms) : { score: 100, band: "High" as const };
      return { ...n, sentiment, polarity, relevance: rel.score, relevanceBand: rel.band };
    });

    // Only Medium/High relevance contribute to scoring (when filtering by symbol)
    const eligible = data.symbol
      ? scored.filter(s => s.relevanceBand === "High" || s.relevanceBand === "Medium")
      : scored;

    let pos = 0, neg = 0, totalW = 0;
    for (const s of eligible) {
      const w = s.relevance / 50; // 0.5..2
      totalW += w;
      if (s.sentiment === "positive") pos += w * Math.max(1, Math.abs(s.polarity));
      else if (s.sentiment === "negative") neg += w * Math.max(1, Math.abs(s.polarity));
    }

    let score = 0;
    if (eligible.length > 0 && (pos + neg) > 0) {
      score = Math.round(((pos - neg) / Math.max(pos + neg, 1)) * 100);
    }

    // Confidence is driven by how many relevant headlines and how strong the polarity
    const sampleConf = Math.min(60, eligible.length * 12);     // up to 60 points for ≥5 items
    const polarityConf = Math.min(40, (pos + neg) * 8);
    const confidence = Math.min(95, Math.max(10, Math.round(sampleConf + polarityConf)));

    const label =
      score >= 60 ? "Strong Bullish" :
      score >= 25 ? "Bullish" :
      score <= -60 ? "Strong Bearish" :
      score <= -25 ? "Bearish" :
      eligible.length === 0 ? "No Signal" : "Neutral / Mixed";

    const relevanceQuality =
      scored.length === 0 ? "None" :
      eligible.length / scored.length >= 0.5 ? "High" :
      eligible.length / scored.length >= 0.2 ? "Medium" : "Low";

    return {
      score,
      label,
      confidence,
      newsCount: scored.length,
      relevantCount: eligible.length,
      relevanceQuality,
      counts: {
        positive: eligible.filter(s => s.sentiment === "positive").length,
        negative: eligible.filter(s => s.sentiment === "negative").length,
        neutral: eligible.filter(s => s.sentiment === "neutral").length,
      },
      // Sort by relevance then recency
      items: scored
        .slice()
        .sort((a, b) =>
          (b.relevance - a.relevance) ||
          ((b.publishedAt ? +new Date(b.publishedAt) : 0) - (a.publishedAt ? +new Date(a.publishedAt) : 0)),
        ),
    };
  });
