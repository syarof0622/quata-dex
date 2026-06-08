// Incremental embedding worker. For each registered source table, pulls rows
// newer than the per-source cursor, renders a compact text chunk, embeds the
// batch through Lovable AI Gateway, and inserts into public.knowledge_chunks.
//
// Designed to be called from a 15-minute cron. Bounded per run (BATCH_LIMIT)
// so a single invocation never explodes credits or runtime.
//
// SERVER ONLY. Never import from client code.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { embedBatch } from "@/lib/embeddings.server";

const BATCH_LIMIT = 50;       // rows per source per run
const EMBED_BATCH_SIZE = 16;  // inputs per gateway call

type ChunkRow = {
  source_table: string;
  source_id: string;
  user_id: string | null;
  symbol: string | null;
  chunk_index: number;
  content: string;
  metadata: Record<string, unknown>;
  source_created_at: string | null;
};

export type SourceRunResult = {
  source_table: string;
  fetched: number;
  inserted: number;
  skipped: number;
  cursor_advanced_to: string | null;
  error: string | null;
};

export type EmbedRunResult = {
  started_at: string;
  finished_at: string;
  duration_ms: number;
  total_inserted: number;
  per_source: SourceRunResult[];
};

async function getCursor(source: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("knowledge_embed_cursors")
    .select("last_processed_at")
    .eq("source_table", source)
    .maybeSingle();
  return ((data as any)?.last_processed_at as string) ?? new Date(0).toISOString();
}

async function setCursor(source: string, lastProcessedAt: string, inserted: number, error: string | null) {
  await supabaseAdmin.from("knowledge_embed_cursors").upsert(
    {
      source_table: source,
      last_processed_at: lastProcessedAt,
      last_run_at: new Date().toISOString(),
      last_inserted: inserted,
      last_error: error,
      updated_at: new Date().toISOString(),
    } as any,
    { onConflict: "source_table" },
  );
}

function clean(s: unknown, max = 800): string {
  if (s == null) return "";
  const t = String(s).replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max) + "…" : t;
}

// ------------------------- Renderers per source -------------------------

function renderNews(row: any): ChunkRow {
  const tickers: string[] = Array.isArray(row.tickers) ? row.tickers.slice(0, 8) : [];
  const sectors: string[] = Array.isArray(row.sectors) ? row.sectors.slice(0, 4) : [];
  const sent = row.sentiment ?? "neutral";
  const score = Number(row.sentiment_score ?? 0).toFixed(2);
  const impact = row.impact_level ?? "normal";
  const content = [
    `BERITA [${row.source ?? "?"}] ${clean(row.title, 300)}`,
    row.summary ? `Ringkasan: ${clean(row.summary, 600)}` : "",
    `Sentimen: ${sent} (${score}); Impact: ${impact}.`,
    tickers.length ? `Emiten: ${tickers.join(", ")}.` : "",
    sectors.length ? `Sektor: ${sectors.join(", ")}.` : "",
    `Tanggal: ${row.published_at ?? row.created_at ?? ""}`,
  ].filter(Boolean).join("\n");
  return {
    source_table: "news_articles",
    source_id: String(row.id),
    user_id: null,
    symbol: tickers[0] ?? null,
    chunk_index: 0,
    content,
    metadata: { source: row.source, url: row.url, tickers, sectors, sentiment: sent, impact_level: impact },
    source_created_at: row.published_at ?? row.created_at ?? null,
  };
}

function renderDisclosure(row: any): ChunkRow {
  const content = [
    `DISCLOSURE IDX [${row.disclosure_type ?? row.event_type ?? "?"}] ${clean(row.title, 300)}`,
    row.summary ? `Ringkasan: ${clean(row.summary, 600)}` : "",
    row.ticker ? `Emiten: ${row.ticker}.` : "",
    `Tanggal: ${row.published_at ?? row.created_at ?? ""}`,
  ].filter(Boolean).join("\n");
  return {
    source_table: "official_disclosures",
    source_id: String(row.id),
    user_id: null,
    symbol: row.ticker ?? null,
    chunk_index: 0,
    content,
    metadata: { type: row.disclosure_type ?? row.event_type, url: row.url, ticker: row.ticker },
    source_created_at: row.published_at ?? row.created_at ?? null,
  };
}

function renderFundamental(row: any): ChunkRow {
  const metrics = [
    row.per != null ? `PER=${row.per}` : null,
    row.pbv != null ? `PBV=${row.pbv}` : null,
    row.roe != null ? `ROE=${row.roe}` : null,
    row.roa != null ? `ROA=${row.roa}` : null,
    row.der != null ? `DER=${row.der}` : null,
    row.dividend_yield != null ? `DivYield=${row.dividend_yield}` : null,
    row.market_cap != null ? `MarketCap=${row.market_cap}` : null,
    row.eps != null ? `EPS=${row.eps}` : null,
    row.revenue_growth != null ? `RevGrowth=${row.revenue_growth}` : null,
    row.earnings_growth != null ? `EarningsGrowth=${row.earnings_growth}` : null,
  ].filter(Boolean).join(", ");
  const content = [
    `FUNDAMENTAL ${row.symbol ?? "?"}: ${metrics || "data terbatas"}`,
    row.sector ? `Sektor: ${row.sector}.` : "",
    row.business_summary ? `Profil: ${clean(row.business_summary, 600)}` : "",
    `Update: ${row.updated_at ?? row.created_at ?? ""}`,
  ].filter(Boolean).join("\n");
  return {
    source_table: "stock_fundamentals",
    source_id: String(row.symbol ?? row.id),
    user_id: null,
    symbol: row.symbol ?? null,
    chunk_index: 0,
    content,
    metadata: { sector: row.sector, updated_at: row.updated_at },
    source_created_at: row.updated_at ?? row.created_at ?? null,
  };
}

function renderMarketSnapshot(row: any): ChunkRow {
  const content = [
    `MARKET SNAPSHOT ${row.snapshot_at ?? ""}`,
    row.idx_composite != null ? `IHSG: ${row.idx_composite} (${row.idx_composite_change_pct ?? "?"}%)` : "",
    row.session_status ? `Sesi: ${row.session_status}.` : "",
    row.market_status ? `Status pasar: ${row.market_status}.` : "",
    row.source_primary ? `Sumber utama: ${row.source_primary}.` : "",
  ].filter(Boolean).join("\n");
  return {
    source_table: "market_data_snapshots",
    source_id: String(row.id),
    user_id: null,
    symbol: null,
    chunk_index: 0,
    content,
    metadata: { source_primary: row.source_primary, session_status: row.session_status },
    source_created_at: row.snapshot_at ?? null,
  };
}

function renderAgentDecision(row: any, userId: string | null): ChunkRow {
  const content = [
    `KEPUTUSAN AI [${row.action ?? "?"}] ${row.symbol ?? "?"}`,
    `Entry=${row.entry_price ?? "?"}, SL=${row.stop_loss ?? "?"}, TP=${row.take_profit ?? "?"}, RR=${row.risk_reward_ratio ?? "?"}.`,
    `Confidence=${row.confidence ?? row.calibrated_confidence ?? "?"}, Strategy=${row.strategy_name ?? row.strategy ?? "?"}, Regime=${row.market_regime ?? "?"}.`,
    row.reasoning ? `Alasan: ${clean(row.reasoning, 800)}` : "",
    `Tanggal: ${row.created_at ?? ""}.`,
  ].filter(Boolean).join("\n");
  return {
    source_table: "ai_agent_decisions",
    source_id: String(row.id),
    user_id: userId,
    symbol: row.symbol ?? null,
    chunk_index: 0,
    content,
    metadata: {
      action: row.action,
      confidence: row.confidence ?? row.calibrated_confidence,
      strategy: row.strategy_name ?? row.strategy,
      decision_status: row.decision_status,
    },
    source_created_at: row.created_at ?? null,
  };
}

function renderTradeReview(row: any, userId: string | null): ChunkRow {
  const content = [
    `REVIEW TRADE ${row.symbol ?? "?"}: ${row.outcome ?? "?"}.`,
    `P&L=${row.pnl ?? "?"} (${row.pnl_pct ?? "?"}%), holding=${row.holding_minutes ?? "?"} menit.`,
    row.what_went_right ? `Benar: ${clean(row.what_went_right, 400)}` : "",
    row.what_went_wrong ? `Salah: ${clean(row.what_went_wrong, 400)}` : "",
    row.lesson_label ? `Pelajaran: ${row.lesson_label}.` : "",
    row.mistake_category ? `Kategori salah: ${row.mistake_category}.` : "",
    `Tanggal: ${row.created_at ?? ""}.`,
  ].filter(Boolean).join("\n");
  return {
    source_table: "ai_trade_reviews",
    source_id: String(row.id),
    user_id: userId,
    symbol: row.symbol ?? null,
    chunk_index: 0,
    content,
    metadata: { outcome: row.outcome, lesson: row.lesson_label, mistake: row.mistake_category },
    source_created_at: row.created_at ?? null,
  };
}

// ------------------------- Source runners -------------------------

async function runPublicSource(
  source_table: string,
  timeCol: string,
  render: (row: any) => ChunkRow,
  selectCols = "*",
  extraFilter?: (q: any) => any,
): Promise<SourceRunResult> {
  const cursor = await getCursor(source_table);
  let q: any = supabaseAdmin
    .from(source_table)
    .select(selectCols)
    .gt(timeCol, cursor)
    .order(timeCol, { ascending: true })
    .limit(BATCH_LIMIT);
  if (extraFilter) q = extraFilter(q);
  const { data, error } = await q;
  if (error) {
    return { source_table, fetched: 0, inserted: 0, skipped: 0, cursor_advanced_to: null, error: error.message };
  }
  const rows = (data ?? []) as any[];
  if (rows.length === 0) {
    return { source_table, fetched: 0, inserted: 0, skipped: 0, cursor_advanced_to: null, error: null };
  }
  const chunks = rows.map(render).filter((c) => c.content.length > 20);
  const inserted = await embedAndInsert(chunks);
  const newCursor = rows[rows.length - 1]?.[timeCol] ?? null;
  if (newCursor) await setCursor(source_table, newCursor, inserted, null);
  return { source_table, fetched: rows.length, inserted, skipped: rows.length - chunks.length, cursor_advanced_to: newCursor, error: null };
}

async function runAgentScopedSource(
  source_table: "ai_agent_decisions" | "ai_trade_reviews",
  render: (row: any, userId: string | null) => ChunkRow,
): Promise<SourceRunResult> {
  const cursor = await getCursor(source_table);
  const { data, error } = await supabaseAdmin
    .from(source_table)
    .select("*")
    .gt("created_at", cursor)
    .order("created_at", { ascending: true })
    .limit(BATCH_LIMIT);
  if (error) {
    return { source_table, fetched: 0, inserted: 0, skipped: 0, cursor_advanced_to: null, error: error.message };
  }
  const rows = (data ?? []) as any[];
  if (rows.length === 0) {
    return { source_table, fetched: 0, inserted: 0, skipped: 0, cursor_advanced_to: null, error: null };
  }
  // Resolve user_id via paper_accounts (each row has paper_account_id)
  const accountIds = [...new Set(rows.map((r) => r.paper_account_id).filter(Boolean))];
  const userByAccount = new Map<string, string>();
  if (accountIds.length > 0) {
    const { data: accs } = await supabaseAdmin
      .from("paper_accounts")
      .select("id, user_id")
      .in("id", accountIds);
    for (const a of (accs ?? []) as any[]) userByAccount.set(a.id, a.user_id);
  }
  const chunks = rows
    .map((r) => render(r, userByAccount.get(r.paper_account_id) ?? null))
    .filter((c) => c.content.length > 20);
  const inserted = await embedAndInsert(chunks);
  const newCursor = rows[rows.length - 1]?.created_at ?? null;
  if (newCursor) await setCursor(source_table, newCursor, inserted, null);
  return { source_table, fetched: rows.length, inserted, skipped: rows.length - chunks.length, cursor_advanced_to: newCursor, error: null };
}

async function embedAndInsert(chunks: ChunkRow[]): Promise<number> {
  if (chunks.length === 0) return 0;
  let inserted = 0;
  for (let i = 0; i < chunks.length; i += EMBED_BATCH_SIZE) {
    const slice = chunks.slice(i, i + EMBED_BATCH_SIZE);
    const vectors = await embedBatch(slice.map((c) => c.content));
    const rows = slice.map((c, idx) => ({
      source_table: c.source_table,
      source_id: c.source_id,
      user_id: c.user_id,
      symbol: c.symbol,
      chunk_index: c.chunk_index,
      content: c.content,
      metadata: c.metadata,
      embedding: vectors[idx] as any,
      source_created_at: c.source_created_at,
    }));
    const { error, count } = await supabaseAdmin
      .from("knowledge_chunks")
      .upsert(rows as any, {
        onConflict: "source_table,source_id,chunk_index",
        ignoreDuplicates: true,
        count: "exact",
      });
    if (error) {
      console.error("[knowledge-embed] insert error:", error.message);
    } else {
      inserted += count ?? 0;
    }
  }
  return inserted;
}

// ------------------------- Entry point -------------------------

export async function runKnowledgeEmbedWorker(): Promise<EmbedRunResult> {
  const started = Date.now();
  const startedIso = new Date(started).toISOString();
  const per: SourceRunResult[] = [];

  // 1) News — public. Filter out duplicates.
  per.push(
    await runPublicSource(
      "news_articles",
      "published_at",
      renderNews,
      "id, source, title, summary, url, tickers, sectors, sentiment, sentiment_score, impact_level, published_at, created_at",
      (q) => q.eq("is_duplicate", false),
    ).catch((e: any) => ({ source_table: "news_articles", fetched: 0, inserted: 0, skipped: 0, cursor_advanced_to: null, error: String(e?.message ?? e) })),
  );

  // 2) Official disclosures — public
  per.push(
    await runPublicSource(
      "official_disclosures",
      "published_at",
      renderDisclosure,
      "*",
    ).catch((e: any) => ({ source_table: "official_disclosures", fetched: 0, inserted: 0, skipped: 0, cursor_advanced_to: null, error: String(e?.message ?? e) })),
  );

  // 3) Fundamentals — public
  per.push(
    await runPublicSource(
      "stock_fundamentals",
      "updated_at",
      renderFundamental,
      "*",
    ).catch((e: any) => ({ source_table: "stock_fundamentals", fetched: 0, inserted: 0, skipped: 0, cursor_advanced_to: null, error: String(e?.message ?? e) })),
  );

  // 4) Market snapshots — public
  per.push(
    await runPublicSource(
      "market_data_snapshots",
      "snapshot_at",
      renderMarketSnapshot,
      "*",
    ).catch((e: any) => ({ source_table: "market_data_snapshots", fetched: 0, inserted: 0, skipped: 0, cursor_advanced_to: null, error: String(e?.message ?? e) })),
  );

  // 5) Agent decisions — user-scoped
  per.push(
    await runAgentScopedSource("ai_agent_decisions", renderAgentDecision).catch((e: any) => ({
      source_table: "ai_agent_decisions", fetched: 0, inserted: 0, skipped: 0, cursor_advanced_to: null, error: String(e?.message ?? e),
    })),
  );

  // 6) Trade reviews — user-scoped
  per.push(
    await runAgentScopedSource("ai_trade_reviews", renderTradeReview).catch((e: any) => ({
      source_table: "ai_trade_reviews", fetched: 0, inserted: 0, skipped: 0, cursor_advanced_to: null, error: String(e?.message ?? e),
    })),
  );

  const finished = Date.now();
  return {
    started_at: startedIso,
    finished_at: new Date(finished).toISOString(),
    duration_ms: finished - started,
    total_inserted: per.reduce((a, r) => a + r.inserted, 0),
    per_source: per,
  };
}
