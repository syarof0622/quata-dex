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

// IDX-specific aliases for strict matching
const IDX_ALIASES: Record<string, string[]> = {
  "BBCA.JK": ["bbca", "bank central asia", "bca indonesia", "pt bank central asia"],
  "BBRI.JK": ["bbri", "bank rakyat indonesia", "bri syariah", "bri indonesia"],
  "BMRI.JK": ["bmri", "bank mandiri"],
  "BBNI.JK": ["bbni", "bank negara indonesia", "bni indonesia"],
  "TLKM.JK": ["tlkm", "telkom indonesia", "telekomunikasi indonesia"],
  "ASII.JK": ["asii", "astra international"],
  "UNVR.JK": ["unvr", "unilever indonesia"],
  "GOTO.JK": ["goto", "gojek tokopedia", "goto gojek"],
  "ADRO.JK": ["adro", "adaro energy", "adaro indonesia"],
  "ANTM.JK": ["antm", "aneka tambang", "antam"],
  "BUMI.JK": ["bumi resources", "pt bumi resources"],
  "INDF.JK": ["indf", "indofood sukses"],
  "ICBP.JK": ["icbp", "indofood cbp"],
  "KLBF.JK": ["klbf", "kalbe farma"],
  "PGAS.JK": ["pgas", "perusahaan gas negara"],
  "PTBA.JK": ["ptba", "bukit asam"],
  "MEDC.JK": ["medc", "medco energi"],
  "INCO.JK": ["inco", "vale indonesia"],
  "MDKA.JK": ["mdka", "merdeka copper"],
  "SMGR.JK": ["smgr", "semen indonesia"],
  "EXCL.JK": ["excl", "xl axiata"],
  "ISAT.JK": ["isat", "indosat"],
  "ARTO.JK": ["arto", "bank jago"],
};

// Foreign-context exclusions to avoid false matches like "Bank of Canada" → BBCA
const FOREIGN_EXCLUSIONS = [
  "bank of canada", "laurentian", "canadian bank", "u.s. bank", "us bank",
  "bank of america", "bank of england", "european central bank",
  "deutsche bank", "barclays", "hsbc", "jpmorgan", "goldman sachs",
  "wells fargo", "citigroup", "morgan stanley", "credit suisse", "ubs ",
];

function buildRelevanceTerms(symbol: string, name?: string | null): { strong: string[]; weak: string[]; isIDX: boolean } {
  const sym = symbol.toUpperCase();
  const base = sym.replace(/\..+$/, "");
  const isIDX = sym.endsWith(".JK");
  const strong = new Set<string>([sym.toLowerCase()]);
  // For IDX, only use base ticker if it's a clear company alias context — rely on aliases instead
  if (!isIDX) strong.add(base.toLowerCase());
  // Add curated aliases (IDX-strict)
  (IDX_ALIASES[sym] ?? []).forEach(a => strong.add(a));
  if (name) {
    const words = tokenize(name).filter(w => w.length > 2 && !/^(tbk|inc|ltd|plc|corp|company|the|and)$/.test(w));
    // Use 2-word phrase for stricter match (e.g. "bank central")
    if (words.length >= 2) strong.add(`${words[0]} ${words[1]}`);
    if (!isIDX) words.slice(0, 3).forEach(w => strong.add(w));
  }
  const sector = sectorOf(sym);
  const weak = sector ? SECTOR_KEYWORDS[sector] ?? [] : [];
  return { strong: [...strong], weak, isIDX };
}

function scoreRelevance(title: string, terms: { strong: string[]; weak: string[]; isIDX: boolean }): {
  score: number;
  band: "High" | "Medium" | "Low" | "Unrelated";
} {
  const t = (title ?? "").toLowerCase();
  // Foreign exclusion check: if title clearly about a foreign bank/entity, hard-exclude for IDX
  if (terms.isIDX) {
    for (const ex of FOREIGN_EXCLUSIONS) {
      if (t.includes(ex)) {
        // Only allow if also has a strong IDX-specific term beyond ticker base alone
        const hasStrongIdx = terms.strong.some(w => w.length > 4 && t.includes(w));
        if (!hasStrongIdx) return { score: 0, band: "Unrelated" };
      }
    }
  }
  let score = 0;
  let strongHit = false;
  for (const w of terms.strong) {
    if (w && w.length >= 3 && t.includes(w)) { score += 50; strongHit = true; }
  }
  // For IDX, sector keywords alone never qualify as Relevant — they're context only
  if (!terms.isIDX) {
    for (const w of terms.weak) if (w && t.includes(w)) score += 15;
  } else {
    // Boost slightly if strong hit AND Indonesia/IDX context present
    const idxContext = ["indonesia", "idx", "ihsg", "jakarta", "bi rate", "ojk", "rupiah"];
    if (strongHit && idxContext.some(k => t.includes(k))) score += 20;
  }
  score = Math.min(100, score);
  // For IDX, require strong hit to be Medium or higher
  let band: "High" | "Medium" | "Low" | "Unrelated";
  if (terms.isIDX) {
    if (!strongHit) band = "Unrelated";
    else if (score >= 65) band = "High";
    else band = "Medium";
  } else {
    band = score >= 50 ? "High" : score >= 25 ? "Medium" : score > 0 ? "Low" : "Unrelated";
  }
  return { score, band };
}

export const newsSentiment = createServerFn({ method: "POST" })
  .inputValidator((d: { symbol?: string }) => z.object({ symbol: z.string().optional() }).parse(d ?? {}))
  .handler(async ({ data }) => {
    const news = (await getNews({ data: { symbol: data.symbol } })) as
      { title: string; link: string; publisher?: string; publishedAt?: string | null; thumbnail?: string | null }[];

    let terms: { strong: string[]; weak: string[]; isIDX: boolean } = { strong: [], weak: [], isIDX: false };
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
