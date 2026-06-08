// Tools exposed to the AI Chatbot via OpenAI-compatible tool calling.
// All executions happen server-side with the admin Supabase client. Outputs
// are deliberately compact JSON so the model can ground its answer without
// blowing the context window. SERVER ONLY.

import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ChatTool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export const CHAT_TOOLS: ChatTool[] = [
  {
    type: "function",
    function: {
      name: "search_news",
      description:
        "Cari berita IDX/saham terbaru dari database internal (news_articles). Gunakan untuk pertanyaan tentang katalis, sentimen, atau headline spesifik. Hanya berita non-duplicate.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Kata kunci pencarian (judul/ringkasan). Boleh kosong jika menyaring symbol saja." },
          symbol: { type: "string", description: "Ticker IDX, contoh BBCA.JK. Opsional." },
          limit: { type: "number", description: "Maksimum hasil (default 8, max 15)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_fundamental",
      description:
        "Ambil rasio fundamental terbaru (PER, PBV, ROE, ROA, DER, EPS, dividend yield, growth) untuk sebuah emiten dari stock_fundamentals.",
      parameters: {
        type: "object",
        properties: { symbol: { type: "string", description: "Ticker, contoh BBCA.JK" } },
        required: ["symbol"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_live_price",
      description:
        "Ambil harga realtime dari Yahoo Finance untuk satu ticker IDX. Pakai untuk pertanyaan 'harga sekarang' atau snapshot harga intraday.",
      parameters: {
        type: "object",
        properties: { symbol: { type: "string", description: "Ticker dengan suffix .JK, mis. BBRI.JK" } },
        required: ["symbol"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_disclosures",
      description:
        "Cari pengumuman resmi IDX/BEI (official_disclosures): dividen, RUPS, rights issue, buyback, suspensi, UMA, dll.",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Ticker (opsional)." },
          limit: { type: "number", description: "Max hasil (default 6, max 12)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_knowledge",
      description:
        "Semantic search ke knowledge base (pgvector) lintas berita, fundamental, chart, disclosure, keputusan AI, dan trade review. Pakai untuk pertanyaan analitik yang butuh konteks historis yang dalam.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Pertanyaan / topik untuk dicari." },
          symbol: { type: "string", description: "Filter ke ticker tertentu (opsional)." },
          k: { type: "number", description: "Jumlah chunk (default 6, max 12)." },
        },
        required: ["query"],
      },
    },
  },
];

// ---------------- Executors ----------------

async function execSearchNews(args: any) {
  const limit = Math.max(1, Math.min(15, Number(args?.limit) || 8));
  const sym = typeof args?.symbol === "string" ? args.symbol.toUpperCase() : null;
  const q = typeof args?.query === "string" ? args.query.trim() : "";
  let query: any = supabaseAdmin
    .from("news_articles")
    .select("title, source, sentiment, sentiment_score, impact_level, published_at, url, tickers")
    .eq("is_duplicate", false)
    .order("published_at", { ascending: false })
    .limit(limit);
  if (sym) query = query.contains("tickers", [sym]);
  if (q) query = query.or(`title.ilike.%${q}%,summary.ilike.%${q}%`);
  const { data, error } = await query;
  if (error) return { ok: false, error: error.message };
  return { ok: true, count: data?.length ?? 0, results: data ?? [] };
}

async function execGetFundamental(args: any) {
  const sym = String(args?.symbol ?? "").toUpperCase();
  if (!sym) return { ok: false, error: "symbol required" };
  const { data, error } = await supabaseAdmin
    .from("stock_fundamentals")
    .select("*")
    .eq("symbol", sym)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: true, found: false, symbol: sym };
  return { ok: true, found: true, symbol: sym, fundamental: data };
}

async function execGetLivePrice(args: any) {
  const sym = String(args?.symbol ?? "").toUpperCase();
  if (!sym) return { ok: false, error: "symbol required" };
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1m&range=1d`,
      { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } },
    );
    if (!r.ok) return { ok: false, error: `yahoo ${r.status}` };
    const j: any = await r.json();
    const meta = j?.chart?.result?.[0]?.meta;
    if (!meta) return { ok: false, error: "no_meta" };
    const price = meta.regularMarketPrice ?? null;
    const prev = meta.chartPreviousClose ?? meta.previousClose ?? null;
    const change = price != null && prev != null ? price - prev : null;
    const pct = change != null && prev ? (change / prev) * 100 : null;
    return {
      ok: true,
      symbol: sym,
      price,
      prevClose: prev,
      change,
      changePct: pct,
      marketState: meta.marketState ?? null,
      currency: meta.currency ?? null,
      asOf: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
    };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

async function execGetDisclosures(args: any) {
  const limit = Math.max(1, Math.min(12, Number(args?.limit) || 6));
  const sym = typeof args?.symbol === "string" ? args.symbol.toUpperCase() : null;
  let q: any = supabaseAdmin
    .from("official_disclosures")
    .select("ticker, disclosure_type, title, summary, published_at, url, impact_level, sentiment")
    .order("published_at", { ascending: false })
    .limit(limit);
  if (sym) q = q.eq("ticker", sym);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true, count: data?.length ?? 0, results: data ?? [] };
}

async function execSearchKnowledge(args: any, userId: string | null) {
  const q = String(args?.query ?? "").trim();
  if (!q) return { ok: false, error: "query required" };
  const k = Math.max(1, Math.min(12, Number(args?.k) || 6));
  const symbol = typeof args?.symbol === "string" ? args.symbol.toUpperCase() : null;
  try {
    const { searchKnowledge } = await import("@/lib/knowledge-rag.server");
    const hits = await searchKnowledge({ query: q, k, userId, symbol });
    return {
      ok: true,
      count: hits.length,
      hits: hits.map((h: any) => ({
        source: h.source_table,
        symbol: h.symbol,
        similarity: Number(h.similarity ?? 0).toFixed(3),
        when: h.source_created_at,
        content: String(h.content ?? "").slice(0, 600),
      })),
    };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

export async function executeChatTool(
  name: string,
  rawArgs: string,
  ctx: { userId: string | null },
): Promise<unknown> {
  let args: any = {};
  try { args = rawArgs ? JSON.parse(rawArgs) : {}; } catch { args = {}; }
  switch (name) {
    case "search_news": return execSearchNews(args);
    case "get_fundamental": return execGetFundamental(args);
    case "get_live_price": return execGetLivePrice(args);
    case "get_disclosures": return execGetDisclosures(args);
    case "search_knowledge": return execSearchKnowledge(args, ctx.userId);
    default: return { ok: false, error: `unknown tool: ${name}` };
  }
}
