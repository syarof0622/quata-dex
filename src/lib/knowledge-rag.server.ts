// RAG helper used by the AI Chatbot. Embeds the user's question through
// Lovable AI Gateway, calls public.match_knowledge to retrieve the top-K
// most-relevant chunks from the unified knowledge base, and formats them
// as a compact system-prompt block.
//
// SERVER ONLY.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { embedOne } from "@/lib/embeddings.server";

export type RagHit = {
  id: string;
  source_table: string;
  source_id: string;
  symbol: string | null;
  content: string;
  metadata: Record<string, unknown>;
  source_created_at: string | null;
  similarity: number;
};

export async function searchKnowledge(opts: {
  query: string;
  k?: number;
  symbol?: string | null;
  userId?: string | null;
  tables?: string[] | null;
  minSimilarity?: number;
}): Promise<RagHit[]> {
  const q = (opts.query ?? "").trim();
  if (!q) return [];
  let vec: number[];
  try {
    vec = await embedOne(q);
  } catch (e) {
    console.error("[rag] embed query failed", e);
    return [];
  }
  const { data, error } = await supabaseAdmin.rpc("match_knowledge", {
    query_embedding: vec as any,
    match_count: opts.k ?? 8,
    filter_symbol: opts.symbol ?? null,
    filter_user: opts.userId ?? null,
    filter_tables: opts.tables ?? null,
    min_similarity: opts.minSimilarity ?? 0.3,
  });
  if (error) {
    console.error("[rag] match_knowledge error", error.message);
    return [];
  }
  return (data ?? []) as RagHit[];
}

const TABLE_LABEL: Record<string, string> = {
  news_articles: "Berita",
  official_disclosures: "Disclosure IDX",
  stock_fundamentals: "Fundamental",
  market_data_snapshots: "Snapshot Pasar",
  ai_agent_decisions: "Keputusan AI Lampau",
  ai_trade_reviews: "Review Trade Lampau",
};

/**
 * Format hits as a compact context block to inject into the AI Chatbot's
 * system prompt. Returns empty string when no hits — caller can skip safely.
 */
export function formatRagContext(hits: RagHit[]): string {
  if (hits.length === 0) return "";
  const lines = hits.map((h, i) => {
    const label = TABLE_LABEL[h.source_table] ?? h.source_table;
    const sim = h.similarity.toFixed(2);
    const when = h.source_created_at ? ` (${h.source_created_at.slice(0, 16).replace("T", " ")})` : "";
    const sym = h.symbol ? ` ${h.symbol}` : "";
    return `[${i + 1}] ${label}${sym}${when} — relevansi ${sim}\n${h.content}`;
  });
  return [
    "KNOWLEDGE BASE (top hasil pencarian semantik dari big data Quanta — berita, fundamental, chart, disclosure, keputusan AI, jurnal trade):",
    ...lines,
    "Gunakan KNOWLEDGE BASE di atas sebagai sumber faktual. Sebutkan ringkasan sumber bila relevan. Jangan mengarang data yang tidak ada.",
  ].join("\n\n");
}
