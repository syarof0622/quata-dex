// Server-only normalization, classification & dedup pipeline.
import {
  IDX_TICKERS, STOCK_KEYWORDS, SECTOR_MAP,
  POSITIVE_LEXICON, NEGATIVE_LEXICON, HIGH_IMPACT_TERMS,
} from "./news-sources";
import type { RawItem } from "./news-rss.server";

export type RelevanceClass =
  | "direct_ticker_news"
  | "company_name_match"
  | "sector_news"
  | "macro_news"
  | "global_context"
  | "irrelevant_noise";

export type ImpactCategory =
  | "earnings" | "dividend" | "buyback" | "corporate_action"
  | "rights_issue" | "merger_acquisition" | "debt_financing"
  | "regulation" | "macro" | "sector_rotation" | "analyst_rating"
  | "uma_suspension" | "governance_risk" | "litigation"
  | "generic_market_news" | "noise";

export type NormalizedArticle = {
  source: string;
  source_id: string;
  title: string;
  summary: string | null;
  url: string;
  canonical_url: string;
  image_url: string | null;
  published_at: string;
  category: string | null;
  tickers: string[];
  sectors: string[];
  keywords: string[];
  sentiment: "positive" | "neutral" | "negative";
  sentiment_score: number;
  confidence: number;
  impact_level: "low" | "medium" | "high";
  impact_score: number;
  related_symbols: string[];
  title_hash: string;
  raw_payload: any;
  duplicate_sources?: string[];
  // News intelligence quality upgrade
  ticker_relevance_score: number;
  relevance_class: RelevanceClass;
  impact_category: ImpactCategory;
  event_cluster_id: string;
  duplicate_group_id: string;
  source_reliability_weight: number;
  is_noise: boolean;
  primary_ticker: string | null;
};

// Source reliability weights (0..1). Higher = more trustworthy.
const SOURCE_RELIABILITY: Record<string, number> = {
  idx_disclosure: 1.00,
  official_disclosure: 0.95,
  kontan: 0.85, cnbc_market: 0.85, antara: 0.85, investor_id: 0.85,
  serpapi_google_news: 0.72, serpapi_google_news_light: 0.70,
  google_news: 0.65,
};
function sourceReliability(id: string): number {
  return SOURCE_RELIABILITY[id] ?? 0.50;
}

function classifyImpactCategory(text: string): { category: ImpactCategory; hint: "high"|"medium"|"low" } {
  const t = text.toLowerCase();
  if (/\b(suspensi|uma|unusual market activity|delisting)\b/.test(t)) return { category: "uma_suspension", hint: "high" };
  if (/\b(merger|akuisisi|takeover|caplok)\b/.test(t)) return { category: "merger_acquisition", hint: "high" };
  if (/\b(right.?issue|rights.?issue)\b/.test(t)) return { category: "rights_issue", hint: "high" };
  if (/\bbuyback\b/.test(t)) return { category: "buyback", hint: "medium" };
  if (/\b(dividen|cum date|ex date)\b/.test(t)) return { category: "dividend", hint: "medium" };
  if (/\b(laba bersih|laporan keuangan|kinerja|q[1-4]|earnings|pendapatan)\b/.test(t)) return { category: "earnings", hint: "high" };
  if (/\b(obligasi|surat utang|debt|pinjaman|kredit sindikasi)\b/.test(t)) return { category: "debt_financing", hint: "medium" };
  if (/\b(ojk|regulasi|aturan baru|peraturan)\b/.test(t)) return { category: "regulation", hint: "medium" };
  if (/\b(bi rate|the fed|fomc|inflasi|gdp|cpi|suku bunga)\b/.test(t)) return { category: "macro", hint: "medium" };
  if (/\b(rotasi sektor|sector rotation)\b/.test(t)) return { category: "sector_rotation", hint: "low" };
  if (/\b(rekomendasi|target harga|upgrade|downgrade|analis)\b/.test(t)) return { category: "analyst_rating", hint: "low" };
  if (/\b(ipo|stock split|spin off)\b/.test(t)) return { category: "corporate_action", hint: "medium" };
  if (/\b(fraud|investigasi|kpk|denda|gugatan|pailit|gagal bayar|default)\b/.test(t)) return { category: "governance_risk", hint: "high" };
  if (/\b(litigasi|tuntutan|class action)\b/.test(t)) return { category: "litigation", hint: "medium" };
  return { category: "generic_market_news", hint: "low" };
}

function computeRelevance(title: string, summary: string, tickers: string[], sectors: string[]):
  { score: number; cls: RelevanceClass; primary: string | null } {
  const titleU = title.toUpperCase();
  const sumU = (summary || "").toUpperCase();
  let score = 0;
  let primary: string | null = null;
  for (const t of tickers) {
    const bare = t.replace(/\.JK$/, "");
    if (new RegExp(`\\b${bare}\\b`).test(titleU)) {
      if (score < 50) { score = 50; primary = t; }
    } else if (new RegExp(`\\b${bare}\\b`).test(sumU)) {
      if (score < 30) { score = Math.max(score, 30); primary = primary ?? t; }
    }
  }
  if (sectors.length > 0) score = Math.max(score, 10);
  const blob = `${title} ${summary}`;
  let cls: RelevanceClass;
  if (score >= 50) cls = "direct_ticker_news";
  else if (score >= 30) cls = "company_name_match";
  else if (score >= 10) cls = "sector_news";
  else if (/\b(ihsg|bei|bursa|pasar modal|emiten)\b/i.test(blob)) { cls = "macro_news"; score = Math.max(score, 8); }
  else if (/\b(s&p|nasdaq|dow jones|fed|wall street|brent|wti)\b/i.test(blob)) { cls = "global_context"; score = Math.max(score, 5); }
  else cls = "irrelevant_noise";
  return { score, cls, primary };
}

function timeBucketHour(iso: string): string {
  try {
    const d = new Date(iso);
    return `${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,"0")}${String(d.getUTCDate()).padStart(2,"0")}-${String(d.getUTCHours()).padStart(2,"0")}`;
  } catch { return "0"; }
}

function canonical(url: string): string {
  try {
    const u = new URL(url);
    // strip utm and other tracking params
    [...u.searchParams.keys()].forEach((k) => {
      if (/^utm_|^fbclid$|^gclid$|^ref$/i.test(k)) u.searchParams.delete(k);
    });
    u.hash = "";
    return u.toString();
  } catch {
    return url;
  }
}

const STOPWORDS = new Set([
  "yang","dan","di","ke","dari","untuk","pada","ini","itu","atau","juga","ada","akan",
  "dengan","oleh","sebagai","tidak","bisa","bagi","saat","the","a","an","of","in","to",
  "for","on","by","is","are","be","with","as","and","or",
]);

function normalizeTitle(t: string): string {
  return t
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w))
    .join(" ")
    .trim();
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

function extractTickers(text: string): string[] {
  const upper = text.toUpperCase();
  const found = new Set<string>();
  for (const t of IDX_TICKERS) {
    const re = new RegExp(`\\b${t}\\b`);
    if (re.test(upper)) found.add(`${t}.JK`);
  }
  return [...found];
}

function extractSectors(text: string): string[] {
  const lower = text.toLowerCase();
  const upper = text.toUpperCase();
  const out = new Set<string>();
  for (const [sector, terms] of Object.entries(SECTOR_MAP)) {
    for (const term of terms) {
      const isTicker = /^[A-Z]+$/.test(term);
      if (isTicker ? new RegExp(`\\b${term}\\b`).test(upper) : lower.includes(term.toLowerCase())) {
        out.add(sector);
        break;
      }
    }
  }
  return [...out];
}

function extractKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  return STOCK_KEYWORDS.filter((k) => lower.includes(k));
}

function isRelevant(text: string, tickers: string[]): boolean {
  if (tickers.length > 0) return true;
  const lower = text.toLowerCase();
  return STOCK_KEYWORDS.some((k) => lower.includes(k));
}

function classifySentiment(text: string): { sentiment: "positive" | "neutral" | "negative"; score: number; confidence: number } {
  const lower = text.toLowerCase();
  let p = 0, n = 0;
  for (const w of POSITIVE_LEXICON) if (lower.includes(w)) p++;
  for (const w of NEGATIVE_LEXICON) if (lower.includes(w)) n++;
  const total = p + n;
  const raw = total === 0 ? 0 : (p - n) / Math.max(p + n, 1);
  const sentiment = raw > 0.15 ? "positive" : raw < -0.15 ? "negative" : "neutral";
  const score = Math.round(raw * 100) / 100;
  const confidence = total === 0 ? 0.3 : Math.min(0.95, 0.4 + total * 0.1);
  return { sentiment, score, confidence };
}

function computeImpact(text: string, tickers: string[], sourcePriority: number): { level: "low" | "medium" | "high"; score: number } {
  let s = 5;
  for (const it of HIGH_IMPACT_TERMS) if (it.re.test(text)) s += it.weight;
  if (tickers.length > 0) s += 15;
  if (tickers.length > 1) s += 5;
  if (sourcePriority <= 2) s += 8;
  s = Math.min(100, s);
  const level = s >= 60 ? "high" : s >= 35 ? "medium" : "low";
  return { level, score: s };
}

export function normalize(item: RawItem, source: { id: string; priority: number; category: string | null }): NormalizedArticle | null {
  const title = item.title?.trim();
  if (!title || !item.link) return null;
  const blob = `${title}\n${item.description ?? ""}`;
  const tickers = extractTickers(blob);
  if (!isRelevant(blob, tickers)) return null;

  const sectors = extractSectors(blob);
  const keywords = extractKeywords(blob);
  const sent = classifySentiment(blob);
  const impact = computeImpact(blob, tickers, source.priority);
  const cu = canonical(item.link);
  const titleNorm = normalizeTitle(title);
  const titleHash = hash(titleNorm);

  let pub: string;
  try { pub = item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(); }
  catch { pub = new Date().toISOString(); }

  return {
    source: source.id,
    source_id: item.guid ?? cu ?? item.link,
    title,
    summary: (item.description ?? "").slice(0, 600) || null,
    url: item.link,
    canonical_url: cu,
    image_url: item.image ?? null,
    published_at: pub,
    category: source.category,
    tickers,
    sectors,
    keywords,
    sentiment: sent.sentiment,
    sentiment_score: sent.score,
    confidence: sent.confidence,
    impact_level: impact.level,
    impact_score: impact.score,
    related_symbols: [...tickers, ...(blob.toUpperCase().includes("IHSG") ? ["IHSG"] : [])],
    title_hash: titleHash,
    raw_payload: { guid: item.guid ?? null },
  };
}

// Convert a SerpApi news item shape into a RawItem-compatible object, then normalize.
export function normalizeSerpApiItem(
  it: { title: string; url: string; summary?: string; publishedAt?: string; id?: string },
  source: { id: string; priority: number; category: string | null },
): NormalizedArticle | null {
  return normalize(
    {
      title: it.title,
      link: it.url,
      description: it.summary ?? "",
      pubDate: it.publishedAt,
      image: null,
      guid: it.id ?? it.url,
    },
    source,
  );
}

export function dedupeBatch(items: NormalizedArticle[]): NormalizedArticle[] {
  const seenHash = new Map<string, NormalizedArticle>();
  const seenUrl = new Map<string, NormalizedArticle>();
  const out: NormalizedArticle[] = [];
  for (const a of items) {
    const dupByHash = seenHash.get(a.title_hash);
    const dupByUrl = seenUrl.get(a.canonical_url);
    const dup = dupByHash ?? dupByUrl;
    if (dup) {
      dup.duplicate_sources = Array.from(new Set([...(dup.duplicate_sources ?? []), a.source]));
      continue;
    }
    seenHash.set(a.title_hash, a);
    seenUrl.set(a.canonical_url, a);
    out.push(a);
  }
  return out;
}
