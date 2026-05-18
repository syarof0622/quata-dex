// Special handling for sources that may be CloudFront/anti-bot blocked
// (Kontan.id, Investor.id). Tries direct mode first; on detected block or
// failure, falls back to Google News RSS site-query aggregation.
// IMPORTANT: does NOT replace existing sources; runs in addition / as fallback.

import { fetchRss, type RawItem } from "./news-rss.server";
import { buildGoogleNewsSiteFallbackUrl, type NewsSourceCfg } from "./news-sources";
import { normalize, type NormalizedArticle } from "./news-pipeline.server";

export type SpecialSourceStatus =
  | "active"
  | "degraded"
  | "blocked"
  | "fallback_active"
  | "cached_only"
  | "failed";

export type SpecialSourceResult = {
  id: string;
  status: SpecialSourceStatus;
  mode: "direct" | "fallback" | "none";
  items: NormalizedArticle[];
  fallbackUsed: boolean;
  usedUrl?: string;
  directError?: string;
  fallbackError?: string;
  reason?: string;
};

function isBlockedHttpStatus(status: number) {
  return status === 403 || status === 429 || status === 503;
}

function isBlockedBody(body: string) {
  const lower = body.toLowerCase();
  return (
    body.includes("CloudFront") ||
    lower.includes("access denied") ||
    lower.includes("request blocked") ||
    lower.includes("captcha") ||
    lower.includes("challenge") ||
    lower.includes("attention required") // Cloudflare
  );
}

async function probeDirect(url: string): Promise<{ ok: boolean; blocked: boolean; reason?: string; items?: RawItem[] }> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    let r: Response;
    try {
      r = await fetch(url, {
        signal: ctl.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 QuantaTerminalBot/1.0 (+news-aggregator)",
          Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, text/html;q=0.5, */*;q=0.1",
        },
        redirect: "follow",
      });
    } finally {
      clearTimeout(t);
    }
    if (isBlockedHttpStatus(r.status)) {
      const sample = await r.text().catch(() => "");
      return { ok: false, blocked: true, reason: `HTTP ${r.status}${isBlockedBody(sample) ? " (block page)" : ""}` };
    }
    if (!r.ok) return { ok: false, blocked: false, reason: `HTTP ${r.status}` };
    const body = await r.text();
    if (isBlockedBody(body)) {
      return { ok: false, blocked: true, reason: "challenge/CAPTCHA page detected" };
    }
    // Only RSS feeds are parseable here; HTML public pages are treated as
    // "reachable but no items" — caller will fall back.
    if (!body.trim().startsWith("<?xml") && !body.includes("<rss") && !body.includes("<feed")) {
      return { ok: true, blocked: false, items: [] };
    }
    try {
      const items = await fetchRss(url);
      return { ok: true, blocked: false, items };
    } catch (e: any) {
      return { ok: false, blocked: false, reason: e?.message ?? "parse error" };
    }
  } catch (e: any) {
    return { ok: false, blocked: false, reason: e?.message ?? "network error" };
  }
}

async function tryDirect(src: NewsSourceCfg): Promise<{ items: RawItem[]; url: string } | { blocked: boolean; error: string }> {
  const urls = src.special?.directUrls ?? [src.url, ...(src.fallbackUrls ?? [])];
  let anyBlocked = false;
  let lastErr = "no direct urls";
  for (const u of urls) {
    const probe = await probeDirect(u);
    if (probe.ok && probe.items && probe.items.length > 0) {
      return { items: probe.items, url: u };
    }
    if (probe.blocked) anyBlocked = true;
    lastErr = probe.reason ?? lastErr;
  }
  return { blocked: anyBlocked, error: lastErr };
}

async function tryFallback(src: NewsSourceCfg): Promise<{ items: NormalizedArticle[]; error?: string }> {
  if (!src.special) return { items: [], error: "no special config" };
  const all: NormalizedArticle[] = [];
  const seen = new Set<string>();
  let lastErr: string | undefined;
  // Run queries in small batches to keep request count modest
  for (const q of src.special.fallbackQueries) {
    const url = buildGoogleNewsSiteFallbackUrl(src.special.siteDomain, q);
    try {
      const items = await fetchRss(url);
      for (const it of items) {
        const k = it.link || it.guid || it.title;
        if (!k || seen.has(k)) continue;
        seen.add(k);
        const n = normalize(it, { id: src.id, priority: src.special.fallbackPriority, category: src.category });
        if (!n) continue;
        // Mark provenance: still under the source's id, but flagged as fallback
        n.raw_payload = {
          ...(n.raw_payload ?? {}),
          fallback_used: true,
          source_type: "google_news_site_fallback",
          original_source: src.name,
          query: q,
          google_news_url: url,
        };
        all.push(n);
      }
    } catch (e: any) {
      lastErr = e?.message ?? String(e);
    }
  }
  return { items: all, error: all.length === 0 ? lastErr ?? "no fallback items" : undefined };
}

export async function fetchSpecialSource(src: NewsSourceCfg): Promise<SpecialSourceResult> {
  if (!src.special) {
    return { id: src.id, status: "failed", mode: "none", items: [], fallbackUsed: false, reason: "missing special config" };
  }

  // 1) Direct mode
  const direct = await tryDirect(src);
  if ("items" in direct) {
    const normalized = direct.items
      .map((it) => normalize(it, { id: src.id, priority: src.priority, category: src.category }))
      .filter((x): x is NormalizedArticle => x !== null);
    if (normalized.length > 0) {
      return { id: src.id, status: "active", mode: "direct", items: normalized, fallbackUsed: false, usedUrl: direct.url };
    }
    // Reachable but yielded nothing — fall through to fallback as a soft degrade
  }

  const directBlocked = "blocked" in direct ? direct.blocked : false;
  const directError = "error" in direct ? direct.error : "no items";

  // 2) Fallback to Google News site queries
  const fb = await tryFallback(src);
  if (fb.items.length > 0) {
    return {
      id: src.id,
      status: "fallback_active",
      mode: "fallback",
      items: fb.items,
      fallbackUsed: true,
      directError,
      reason: directBlocked ? "Direct source blocked (CloudFront/anti-bot); using Google News fallback" : "Direct source unavailable; using Google News fallback",
    };
  }

  // 3) Both failed — caller will rely on existing cached rows in DB
  return {
    id: src.id,
    status: directBlocked ? "blocked" : "cached_only",
    mode: "none",
    items: [],
    fallbackUsed: false,
    directError,
    fallbackError: fb.error,
    reason: "Direct and fallback both failed; serving cached data only",
  };
}
