// Update 15 — Link a symbol's fundamentals to recent news / disclosure
// context. News is used ONLY for validation, not for fabricating metrics.
//
// Strategy:
//   1. Pull last 30 days of news_articles for the symbol.
//   2. Pull last 90 days of corporate_actions for the symbol.
//   3. Classify each item into a link_type using keyword + sentiment.
//   4. Persist into fundamental_news_links with a validation_effect.
//   5. Return validation_notes that the bridge writer can merge into
//      stock_fundamentals.validation_notes.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

type LinkType =
  | "dividend_context"
  | "earnings_context"
  | "debt_context"
  | "revenue_context"
  | "corporate_action_context"
  | "regulatory_context"
  | "risk_context"
  | "general_context";

type ValidationEffect =
  | "confirms_context"
  | "requires_verification"
  | "possible_stale_metric"
  | "risk_warning"
  | "no_direct_effect";

type Classified = {
  link_type: LinkType;
  validation_effect: ValidationEffect;
  relevance_score: number;
  note: string;
};

const KEYWORDS: { type: LinkType; effect: ValidationEffect; rx: RegExp; weight: number; note: string }[] = [
  { type: "dividend_context", effect: "requires_verification", weight: 0.8,
    rx: /\b(dividen|dividend|cash[-\s]?dividend|interim\s+dividend|final\s+dividend|yield\s+dividen)\b/i,
    note: "Dividend-related news found. Verify dividend yield against official disclosure." },
  { type: "earnings_context", effect: "possible_stale_metric", weight: 0.8,
    rx: /\b(laba\s+bersih|net\s+income|earnings|laporan\s+keuangan|EPS|kuartal|quarterly\s+report|earnings\s+release)\b/i,
    note: "Earnings-related news found. PER / EPS may be stale until the next ingest." },
  { type: "debt_context", effect: "risk_warning", weight: 0.9,
    rx: /\b(utang|debt|obligasi|restrukturisasi|default|covenant|gagal\s+bayar|refinanc|debt[-\s]?to[-\s]?equity)\b/i,
    note: "Debt-related news found. Treat DER and solvency metrics with extra caution." },
  { type: "revenue_context", effect: "possible_stale_metric", weight: 0.7,
    rx: /\b(pendapatan|revenue|penjualan|sales|top[-\s]?line|growth\s+pendapatan)\b/i,
    note: "Revenue-related news found. Revenue growth metric may be outdated." },
  { type: "corporate_action_context", effect: "requires_verification", weight: 0.85,
    rx: /\b(stock\s+split|reverse\s+split|right[-\s]?issue|rights\s+issue|buyback|akuisisi|merger|spin[-\s]?off|HMETD|private\s+placement)\b/i,
    note: "Corporate action detected. Share count and per-share metrics may change." },
  { type: "regulatory_context", effect: "risk_warning", weight: 0.9,
    rx: /\b(OJK|BEI|sanksi|denda|delisting|suspend|peringatan|investigasi|fraud|skandal)\b/i,
    note: "Regulatory / governance news found. Apply additional risk discount." },
  { type: "risk_context", effect: "risk_warning", weight: 0.75,
    rx: /\b(rugi|loss|profit\s+warning|penurunan\s+laba|impairment|write[-\s]?down|going\s+concern)\b/i,
    note: "Risk / loss-related news found. Earnings quality may be deteriorating." },
];

function classify(title: string, summary: string | null): Classified | null {
  const text = `${title}\n${summary ?? ""}`;
  let best: Classified | null = null;
  for (const k of KEYWORDS) {
    if (k.rx.test(text)) {
      const score = k.weight;
      if (!best || score > best.relevance_score) {
        best = {
          link_type: k.type,
          validation_effect: k.effect,
          relevance_score: score,
          note: k.note,
        };
      }
    }
  }
  return best;
}

export type LinkResult = {
  linked: number;
  validationNotes: string[];
  latestRelatedNewsAt: string | null;
  relatedNewsCount: number;
};

export async function linkFundamentalToNews(symbol: string): Promise<LinkResult> {
  const sym = symbol.toUpperCase();
  const base = sym.replace(/\.JK$/i, "");
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // 1) Recent news
  const { data: news } = await supabaseAdmin
    .from("news_articles")
    .select("id, title, summary, published_at")
    .or(
      `primary_ticker.eq.${sym},primary_ticker.eq.${base},tickers.cs.{${sym}},tickers.cs.{${base}}`,
    )
    .gte("published_at", since)
    .order("published_at", { ascending: false })
    .limit(50);

  const noteSet = new Set<string>();
  const rows: Array<Record<string, unknown>> = [];
  let latest: string | null = null;
  let relatedCount = 0;

  for (const a of news ?? []) {
    const c = classify(a.title ?? "", a.summary);
    if (!c) continue;
    relatedCount++;
    if (!latest || (a.published_at && a.published_at > latest)) latest = a.published_at;
    noteSet.add(c.note);
    rows.push({
      symbol: sym,
      news_article_id: a.id,
      disclosure_id: null,
      link_type: c.link_type,
      relevance_score: c.relevance_score,
      validation_effect: c.validation_effect,
      note: c.note,
    });
  }

  // 2) Recent corporate actions (treat as official disclosure context)
  const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data: actions } = await supabaseAdmin
    .from("corporate_actions")
    .select("id, action_type, title, announcement_date, ex_date")
    .eq("symbol", sym.endsWith(".JK") ? sym : `${base}.JK`)
    .gte("created_at", since90)
    .order("created_at", { ascending: false })
    .limit(20);

  for (const ca of actions ?? []) {
    const linkType: LinkType =
      ca.action_type === "dividend" ? "dividend_context" :
      ca.action_type === "stock_split" || ca.action_type === "reverse_split" || ca.action_type === "rights_issue" ? "corporate_action_context" :
      "general_context";
    const note = `Official disclosure: ${ca.action_type} — ${ca.title ?? "no title"}.`;
    noteSet.add(note);
    rows.push({
      symbol: sym,
      news_article_id: null,
      disclosure_id: ca.id,
      link_type: linkType,
      relevance_score: 1.0,
      validation_effect: "confirms_context",
      note,
    });
  }

  // 3) Refresh links: clear existing for this symbol, insert fresh
  if (rows.length > 0) {
    await supabaseAdmin.from("fundamental_news_links").delete().eq("symbol", sym);
    // Insert in chunks of 200 to stay well under PostgREST limits
    for (let i = 0; i < rows.length; i += 200) {
      await supabaseAdmin.from("fundamental_news_links").insert(rows.slice(i, i + 200));
    }
  }

  return {
    linked: rows.length,
    validationNotes: Array.from(noteSet),
    latestRelatedNewsAt: latest,
    relatedNewsCount: relatedCount,
  };
}
