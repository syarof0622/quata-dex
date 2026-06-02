/**
 * PATCH 9 — News ↔ Disclosure Linker
 *
 * Background helper that, for each official_disclosure / corporate_action /
 * regulatory_event, scans news_articles within ±48h around the event and
 * marks matching news as "official disclosure echoes" by attaching the
 * disclosure id into news_articles.raw_payload.linked_disclosure_id and
 * uplifting impact_category to "official_disclosure_echo".
 *
 * Pure read+update; safe to run from cron. Never invents disclosures.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const WINDOW_HOURS = 48;

type LinkResult = {
  scannedDisclosures: number;
  linkedNewsArticles: number;
  errors: string[];
};

function normalizeTitle(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokensFromTitle(title: string): string[] {
  const stop = new Set([
    "the", "and", "for", "with", "to", "of", "in", "on", "at", "by",
    "yang", "dan", "untuk", "ke", "di", "dari", "akan", "telah", "atas",
  ]);
  return normalizeTitle(title)
    .split(" ")
    .filter((t) => t.length >= 4 && !stop.has(t));
}

function overlapScore(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  const hits = a.filter((t) => setB.has(t)).length;
  return hits / Math.max(a.length, b.length);
}

export async function runNewsDisclosureLinker(opts: {
  hours?: number;
  symbolLimit?: number;
} = {}): Promise<LinkResult> {
  const windowHours = opts.hours ?? WINDOW_HOURS;
  const since = new Date(Date.now() - windowHours * 3600_000).toISOString();
  const result: LinkResult = {
    scannedDisclosures: 0,
    linkedNewsArticles: 0,
    errors: [],
  };

  // Collect recent disclosure events from three tables.
  const events: Array<{
    id: string;
    table: "official_disclosures" | "corporate_actions" | "regulatory_events";
    symbol: string;
    title: string;
    publishedAt: string;
    impact?: string | null;
    sentiment?: string | null;
  }> = [];

  for (const table of ["official_disclosures", "corporate_actions", "regulatory_events"] as const) {
    try {
      const dateCol = table === "corporate_actions" ? "announcement_date" : "published_at";
      const hasSentiment = table !== "regulatory_events";
      const selectCols = `id, symbol, title, ${dateCol}, impact_score${hasSentiment ? ", sentiment" : ""}`;
      const { data, error } = await supabaseAdmin
        .from(table)
        .select(selectCols)
        .gte(dateCol, since)
        .order(dateCol, { ascending: false })
        .limit(200);
      if (error) {
        result.errors.push(`${table}: ${error.message}`);
        continue;
      }
      for (const row of (data ?? []) as any[]) {
        const pub = row[dateCol];
        if (!pub || !row.symbol || !row.title) continue;
        events.push({
          id: row.id,
          table,
          symbol: String(row.symbol).toUpperCase(),
          title: String(row.title),
          publishedAt: typeof pub === "string" ? pub : new Date(pub).toISOString(),
          impact: row.impact_score != null ? String(row.impact_score) : null,
          sentiment: hasSentiment ? (row.sentiment ?? null) : null,
        });
      }
    } catch (e: any) {
      result.errors.push(`${table}: ${e?.message ?? String(e)}`);
    }
  }

  result.scannedDisclosures = events.length;
  if (!events.length) return result;

  // Group events by symbol for efficient news fetch.
  const bySymbol = new Map<string, typeof events>();
  for (const ev of events) {
    const arr = bySymbol.get(ev.symbol) ?? [];
    arr.push(ev);
    bySymbol.set(ev.symbol, arr);
  }

  const symbols = Array.from(bySymbol.keys()).slice(0, opts.symbolLimit ?? 100);

  // Fetch candidate news in the same time window for those symbols.
  const { data: news, error: nerr } = await supabaseAdmin
    .from("news_articles")
    .select("id, title, tickers, published_at, impact_category, raw_payload")
    .gte("published_at", new Date(Date.now() - (windowHours + 24) * 3600_000).toISOString())
    .order("published_at", { ascending: false })
    .limit(2000);
  if (nerr) {
    result.errors.push(`news_articles: ${nerr.message}`);
    return result;
  }

  for (const article of (news ?? []) as any[]) {
    const tickers: string[] = Array.isArray(article.tickers)
      ? article.tickers.map((t: any) => String(t).toUpperCase())
      : [];
    const matchSym = tickers.find((t) => symbols.includes(t));
    if (!matchSym) continue;

    const newsTokens = tokensFromTitle(article.title ?? "");
    const newsTime = new Date(article.published_at).getTime();
    let bestMatch: { ev: typeof events[number]; score: number } | null = null;

    for (const ev of bySymbol.get(matchSym) ?? []) {
      const evTime = new Date(ev.publishedAt).getTime();
      const dh = Math.abs(newsTime - evTime) / 3600_000;
      if (dh > windowHours) continue;
      const score = overlapScore(newsTokens, tokensFromTitle(ev.title));
      // Time decay: closer = better
      const timeBonus = 1 - Math.min(1, dh / windowHours);
      const composite = score * 0.7 + timeBonus * 0.3;
      if (composite >= 0.45 && (!bestMatch || composite > bestMatch.score)) {
        bestMatch = { ev, score: composite };
      }
    }

    if (!bestMatch) continue;

    const existing = (article.raw_payload && typeof article.raw_payload === "object")
      ? article.raw_payload
      : {};
    if (existing?.linked_disclosure_id === bestMatch.ev.id) continue; // already linked

    const newPayload = {
      ...existing,
      linked_disclosure_id: bestMatch.ev.id,
      linked_disclosure_table: bestMatch.ev.table,
      linked_disclosure_score: Number(bestMatch.score.toFixed(3)),
      linked_disclosure_sentiment: bestMatch.ev.sentiment,
    };

    const { error: uerr } = await supabaseAdmin
      .from("news_articles")
      .update({
        raw_payload: newPayload as any,
        impact_category: "official_disclosure_echo",
      })
      .eq("id", article.id);

    if (uerr) {
      result.errors.push(`update news ${article.id}: ${uerr.message}`);
    } else {
      result.linkedNewsArticles += 1;
    }
  }

  return result;
}
