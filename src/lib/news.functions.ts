import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const FilterSchema = z.object({
  limit: z.number().int().min(1).max(100).default(40),
  source: z.string().optional(),
  sentiment: z.enum(["positive", "neutral", "negative"]).optional(),
  ticker: z.string().optional(),
  impactLevel: z.enum(["low", "medium", "high"]).optional(),
  search: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
});

export const listNews = createServerFn({ method: "POST" })
  .inputValidator((d) => FilterSchema.parse(d ?? {}))
  .handler(async ({ data }) => {
    let q = supabaseAdmin
      .from("news_articles")
      .select("id, source, title, summary, url, image_url, published_at, sentiment, sentiment_score, impact_level, impact_score, tickers, sectors")
      .eq("is_duplicate", false)
      .order("published_at", { ascending: false })
      .limit(data.limit);

    if (data.source) q = q.eq("source", data.source);
    if (data.sentiment) q = q.eq("sentiment", data.sentiment);
    if (data.impactLevel) q = q.eq("impact_level", data.impactLevel);
    if (data.ticker) q = q.contains("tickers", [data.ticker.toUpperCase()]);
    if (data.search) q = q.ilike("title", `%${data.search}%`);
    if (data.fromDate) q = q.gte("published_at", data.fromDate);
    if (data.toDate) q = q.lte("published_at", data.toDate);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getMarketSentiment = createServerFn({ method: "POST" })
  .handler(async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabaseAdmin
      .from("news_articles")
      .select("sentiment, sentiment_score, impact_level, impact_score, tickers")
      .gte("published_at", since)
      .eq("is_duplicate", false);
    if (error) throw new Error(error.message);

    let pos = 0, neg = 0, neu = 0, sumScore = 0, highImpact = 0;
    const byTicker = new Map<string, { score: number; n: number }>();
    for (const r of (data ?? []) as any[]) {
      if (r.sentiment === "positive") pos++;
      else if (r.sentiment === "negative") neg++;
      else neu++;
      sumScore += Number(r.sentiment_score ?? 0);
      if (r.impact_level === "high") highImpact++;
      for (const t of (r.tickers ?? []) as string[]) {
        const cur = byTicker.get(t) ?? { score: 0, n: 0 };
        cur.score += Number(r.sentiment_score ?? 0);
        cur.n += 1;
        byTicker.set(t, cur);
      }
    }
    const total = pos + neg + neu;
    const avg = total ? sumScore / total : 0;
    const scaled = Math.round(avg * 100);
    const label = scaled > 30 ? "Bullish" : scaled > 10 ? "Mildly Bullish" : scaled < -30 ? "Bearish" : scaled < -10 ? "Mildly Bearish" : "Neutral";

    const tickerRanked = [...byTicker.entries()]
      .map(([symbol, v]) => ({ symbol, score: Math.round((v.score / Math.max(1, v.n)) * 100) / 100, count: v.n }))
      .filter((t) => t.count >= 2);
    const topPositive = [...tickerRanked].sort((a, b) => b.score - a.score).slice(0, 5);
    const topNegative = [...tickerRanked].sort((a, b) => a.score - b.score).slice(0, 5);

    return {
      counts: { positive: pos, neutral: neu, negative: neg, total },
      sentimentScore: scaled,
      label,
      highImpactCount: highImpact,
      topPositive,
      topNegative,
    };
  });

export const getTickerNews = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ symbol: z.string(), limit: z.number().int().min(1).max(50).default(20) }).parse(d))
  .handler(async ({ data }) => {
    const sym = data.symbol.toUpperCase().endsWith(".JK") ? data.symbol.toUpperCase() : `${data.symbol.toUpperCase()}.JK`;
    const { data: rows, error } = await supabaseAdmin
      .from("news_articles")
      .select("id, source, title, summary, url, image_url, published_at, sentiment, sentiment_score, impact_level, impact_score, tickers")
      .contains("tickers", [sym])
      .eq("is_duplicate", false)
      .order("published_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getTickerSentiment = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ symbol: z.string() }).parse(d))
  .handler(async ({ data }) => {
    const sym = data.symbol.toUpperCase().endsWith(".JK") ? data.symbol.toUpperCase() : `${data.symbol.toUpperCase()}.JK`;
    const { data: row } = await supabaseAdmin
      .from("ticker_sentiment_summary")
      .select("*")
      .eq("symbol", sym)
      .maybeSingle();
    return row ?? null;
  });

export const getSourcesStatus = createServerFn({ method: "POST" })
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("news_sources")
      .select("id, name, status, priority, last_success_at, last_failed_at, last_error, articles_today, enabled")
      .order("priority", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const refreshNewsNow = createServerFn({ method: "POST" })
  .handler(async () => {
    const { NEWS_SOURCES } = await import("@/lib/news-sources");
    const { fetchRssWithFallback } = await import("@/lib/news-rss.server");
    const { normalize, dedupeBatch } = await import("@/lib/news-pipeline.server");

    const all: any[] = [];
    const statuses: any[] = [];
    for (const src of NEWS_SOURCES.filter((s) => s.enabled)) {
      try {
        const { url, items } = await fetchRssWithFallback(src.url, src.fallbackUrls ?? []);
        const normalized = items.map((it) => normalize(it, { id: src.id, priority: src.priority, category: src.category })).filter(Boolean) as any[];
        all.push(...normalized);
        statuses.push({ id: src.id, ok: true, count: normalized.length, used_url: url });
      } catch (e: any) {
        statuses.push({ id: src.id, ok: false, error: String(e?.message ?? e) });
      }
    }
    const deduped = dedupeBatch(all);
    const now = new Date().toISOString();
    for (let i = 0; i < deduped.length; i += 100) {
      const chunk = deduped.slice(i, i + 100);
      await supabaseAdmin.from("news_articles").upsert(chunk, { onConflict: "source,source_id", ignoreDuplicates: true });
    }
    for (const s of statuses) {
      await supabaseAdmin.from("news_sources").update(
        s.ok
          ? { last_success_at: now, status: "active", fail_count: 0, last_error: null, articles_today: s.count, updated_at: now }
          : { last_failed_at: now, status: "failed", last_error: s.error, updated_at: now }
      ).eq("id", s.id);
    }
    return { ok: true, total: all.length, deduped: deduped.length, statuses };
  });
