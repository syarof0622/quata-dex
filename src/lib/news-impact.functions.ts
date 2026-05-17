import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getCandles, getNews } from "./market.functions";
import type { Candle } from "./indicators";

// Sentiment lexicons
const POSITIVE = [
  "beat","beats","surge","surges","rally","rallies","upgrade","upgraded","record",
  "strong","growth","profit","gain","gains","outperform","bullish","raised","jumps",
  "jump","soar","soars","wins","win","approval","approve","launches","expand","expansion",
  "buyback","dividend","contract","deal","partnership","milestone",
];
const NEGATIVE = [
  "miss","misses","plunge","plunges","drop","drops","downgrade","downgraded","loss","losses",
  "weak","decline","declines","cut","cuts","bearish","fall","falls","slumps","slump","probe",
  "lawsuit","fraud","layoff","layoffs","recall","ban","bans","investigation","resign",
  "resigns","warning","warns","fine","fines","delay","delays","bankruptcy","default",
];

// High-impact event keywords. Each weight bumps the absolute impact score.
const IMPACT_TERMS: { re: RegExp; weight: number; label: string }[] = [
  { re: /\b(earnings|q[1-4]|quarterly results?|guidance)\b/i, weight: 25, label: "earnings" },
  { re: /\b(merger|acquisition|acquire|buyout|takeover)\b/i,  weight: 30, label: "M&A" },
  { re: /\b(fda|approval|clinical|trial results?|phase [123])\b/i, weight: 28, label: "regulatory" },
  { re: /\b(lawsuit|fraud|sec\s+charges|doj|antitrust|probe|investigation)\b/i, weight: 26, label: "legal" },
  { re: /\b(dividend|buyback|share repurchase|split)\b/i,     weight: 18, label: "capital" },
  { re: /\b(ceo|cfo|chairman)\b.*\b(resign|step\s*down|appoint|name[d]?)\b/i, weight: 20, label: "leadership" },
  { re: /\b(rate hike|fed|fomc|cpi|inflation|gdp|jobs report|nonfarm)\b/i, weight: 15, label: "macro" },
  { re: /\b(downgrade|upgrade|price target|reiterates?)\b/i,  weight: 12, label: "analyst" },
  { re: /\b(layoff|restructur|bankruptcy|chapter 11|default)\b/i, weight: 24, label: "distress" },
];

type Side = "positive" | "negative" | "neutral";

function scoreHeadline(title: string): { sentiment: Side; sentimentScore: number; impact: number; tags: string[] } {
  const t = (title ?? "").toLowerCase();
  const p = POSITIVE.reduce((a, w) => a + (t.includes(w) ? 1 : 0), 0);
  const n = NEGATIVE.reduce((a, w) => a + (t.includes(w) ? 1 : 0), 0);
  const sentimentScore = p - n;
  const sentiment: Side = sentimentScore > 0 ? "positive" : sentimentScore < 0 ? "negative" : "neutral";
  let impact = 5; // base
  const tags: string[] = [];
  for (const it of IMPACT_TERMS) {
    if (it.re.test(title)) { impact += it.weight; tags.push(it.label); }
  }
  impact += Math.min(20, (p + n) * 4); // amplify when many polarity words present
  return { sentiment, sentimentScore, impact: Math.min(100, impact), tags };
}

function pctReaction(candles: Candle[], publishedAt: string | null | undefined): number | null {
  if (!publishedAt || candles.length < 5) return null;
  const ts = new Date(publishedAt).getTime() / 1000;
  // Find first candle whose time >= published time
  const i = candles.findIndex(c => c.time >= ts);
  if (i < 0 || i >= candles.length - 1) return null;
  const before = candles[i].open;
  const after = candles[Math.min(candles.length - 1, i + 1)].close;
  if (!before) return null;
  return +(((after - before) / before) * 100).toFixed(2);
}

export const newsImpact = createServerFn({ method: "POST" })
  .inputValidator((d: { symbol?: string }) =>
    z.object({ symbol: z.string().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data }) => {
    const news = (await getNews({ data: { symbol: data.symbol } })) as
      { title: string; link: string; publisher?: string; publishedAt?: string | null; thumbnail?: string | null }[];

    let candles: Candle[] = [];
    if (data.symbol) {
      try {
        candles = (await getCandles({ data: { symbol: data.symbol, timeframe: "1d" } })) as Candle[];
      } catch {/* ignore */}
    }

    const scored = news.map(n => {
      const s = scoreHeadline(n.title);
      const reaction = pctReaction(candles, n.publishedAt);
      // Prefer provider sentiment when present (-1..1 from Marketaux)
      const provider = typeof (n as any).sentimentScore === "number" ? (n as any).sentimentScore : null;
      const sentiment: Side =
        provider !== null
          ? provider > 0.05 ? "positive" : provider < -0.05 ? "negative" : "neutral"
          : s.sentiment;
      return {
        ...n,
        sentiment,
        sentimentScore: provider !== null ? Math.round(provider * 100) / 100 : s.sentimentScore,
        impact: s.impact,
        tags: s.tags,
        priceReactionPct: reaction,
      };
    });

    // Aggregate, weighted by impact
    let posW = 0, negW = 0, totalW = 0;
    for (const it of scored) {
      const w = it.impact;
      totalW += w;
      if (it.sentiment === "positive") posW += w;
      else if (it.sentiment === "negative") negW += w;
    }
    const sentimentScore = totalW === 0 ? 0 : Math.round(((posW - negW) / totalW) * 100);
    const impactIndex = Math.round(scored.reduce((a, x) => a + x.impact, 0) / Math.max(1, scored.length));
    const label =
      sentimentScore > 30 ? "Bullish" :
      sentimentScore > 10 ? "Mildly Bullish" :
      sentimentScore < -30 ? "Bearish" :
      sentimentScore < -10 ? "Mildly Bearish" : "Neutral";
    const impactLabel =
      impactIndex >= 60 ? "High" :
      impactIndex >= 35 ? "Moderate" : "Low";

    return {
      sentimentScore,
      impactIndex,
      label,
      impactLabel,
      counts: {
        positive: scored.filter(s => s.sentiment === "positive").length,
        negative: scored.filter(s => s.sentiment === "negative").length,
        neutral: scored.filter(s => s.sentiment === "neutral").length,
      },
      items: scored.sort((a, b) => b.impact - a.impact),
    };
  });

export type NewsImpactResult = Awaited<ReturnType<typeof newsImpact>>;
