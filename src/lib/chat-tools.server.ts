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
        "Cari berita IDX/saham dari database internal (news_articles). Untuk pertanyaan katalis, sentimen, headline. Bisa dengan rentang waktu via since_days (default 30, max 1825 = 5 tahun).",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Kata kunci pencarian." },
          symbol: { type: "string", description: "Ticker IDX, contoh BBCA.JK." },
          since_days: { type: "number", description: "Lookback hari (default 30, max 1825)." },
          limit: { type: "number", description: "Max hasil (default 8, max 30)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_fundamental",
      description:
        "Ambil rasio fundamental terbaru (PER, PBV, ROE, ROA, DER, EPS, dividend yield, growth) untuk emiten dari stock_fundamentals.",
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
      name: "get_fundamental_history",
      description:
        "Ambil snapshot fundamental historis (fundamental_snapshots) untuk satu emiten. Berguna untuk trend PER/PBV/ROE/margin tahunan.",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string" },
          limit: { type: "number", description: "Default 8, max 24." },
        },
        required: ["symbol"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_live_price",
      description: "Harga realtime Yahoo Finance untuk satu ticker IDX.",
      parameters: {
        type: "object",
        properties: { symbol: { type: "string" } },
        required: ["symbol"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_price_history",
      description:
        "Harga historis (OHLCV) dari Yahoo Finance. Bisa multi-tahun. range: 1mo|3mo|6mo|1y|2y|5y|10y|max. interval: 1d|1wk|1mo. Pakai untuk pertanyaan kinerja jangka panjang, drawdown, tren.",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string" },
          range: { type: "string", description: "Default 1y." },
          interval: { type: "string", description: "Default 1d." },
        },
        required: ["symbol"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_disclosures",
      description:
        "Pengumuman resmi IDX/BEI (official_disclosures): dividen, RUPS, rights issue, buyback, suspensi, UMA. Bisa filter waktu via since_days.",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string" },
          since_days: { type: "number", description: "Lookback hari (default 365, max 1825)." },
          limit: { type: "number", description: "Default 6, max 20." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_knowledge",
      description:
        "Semantic search ke knowledge base (pgvector) lintas semua data historis: berita, fundamental, chart, disclosure, keputusan AI, trade review. Wajib digunakan untuk pertanyaan analitik mendalam berbasis sejarah.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          symbol: { type: "string" },
          k: { type: "number", description: "Default 6, max 12." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_paper_trade_history",
      description:
        "History paper trading user: orders & posisi yang sudah ditutup. Untuk pertanyaan 'trade saya sebelumnya', 'win/loss BBCA', dll. Otomatis ter-scope ke user yang sedang chat.",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string" },
          since_days: { type: "number", description: "Default 365, max 1825." },
          limit: { type: "number", description: "Default 20, max 100." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_ai_decision_history",
      description:
        "History keputusan AI Agent (ai_agent_decisions) — BUY/HOLD/BLOCKED dengan alasan. Untuk pertanyaan 'kenapa agent ambil X', 'rekap keputusan minggu ini'.",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string" },
          since_days: { type: "number", description: "Default 30, max 365." },
          limit: { type: "number", description: "Default 15, max 50." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "scrape_news_now",
      description:
        "Trigger ingest berita LIVE dari semua sumber RSS+SerpApi. WAJIB dipanggil jika search_news mengembalikan kosong untuk topik aktual atau data terlihat basi (>6 jam). Mahal — pakai hanya bila perlu.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "scrape_fundamental_now",
      description:
        "Scrape ulang fundamental satu emiten dari Yahoo + sumber lain. Panggil bila get_fundamental kosong atau updated_at >30 hari.",
      parameters: {
        type: "object",
        properties: { symbol: { type: "string" } },
        required: ["symbol"],
      },
    },
  },
];

// ---------------- Helpers ----------------

function sinceIso(days: number, capDays: number) {
  const d = Math.max(1, Math.min(capDays, Math.floor(Number(days) || capDays)));
  return new Date(Date.now() - d * 86400_000).toISOString();
}

// ---------------- Executors ----------------

async function execSearchNews(args: any) {
  const limit = Math.max(1, Math.min(30, Number(args?.limit) || 8));
  const sym = typeof args?.symbol === "string" ? args.symbol.toUpperCase() : null;
  const q = typeof args?.query === "string" ? args.query.trim() : "";
  const since = sinceIso(Number(args?.since_days) || 30, 1825);
  let query: any = supabaseAdmin
    .from("news_articles")
    .select("title, source, sentiment, sentiment_score, impact_level, published_at, url, tickers")
    .eq("is_duplicate", false)
    .gte("published_at", since)
    .order("published_at", { ascending: false })
    .limit(limit);
  if (sym) query = query.contains("tickers", [sym]);
  if (q) query = query.or(`title.ilike.%${q}%,summary.ilike.%${q}%`);
  const { data, error } = await query;
  if (error) return { ok: false, error: error.message };
  return { ok: true, count: data?.length ?? 0, since, results: data ?? [] };
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

async function execGetFundamentalHistory(args: any) {
  const sym = String(args?.symbol ?? "").toUpperCase();
  if (!sym) return { ok: false, error: "symbol required" };
  const limit = Math.max(1, Math.min(24, Number(args?.limit) || 8));
  const { data, error } = await supabaseAdmin
    .from("fundamental_snapshots")
    .select("*")
    .eq("symbol", sym)
    .order("snapshot_date", { ascending: false })
    .limit(limit);
  if (error) return { ok: false, error: error.message };
  return { ok: true, count: data?.length ?? 0, symbol: sym, snapshots: data ?? [] };
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
      ok: true, symbol: sym, price, prevClose: prev, change, changePct: pct,
      marketState: meta.marketState ?? null, currency: meta.currency ?? null,
      asOf: meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString() : null,
    };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

async function execGetPriceHistory(args: any) {
  const sym = String(args?.symbol ?? "").toUpperCase();
  if (!sym) return { ok: false, error: "symbol required" };
  const allowedRanges = new Set(["1mo","3mo","6mo","1y","2y","5y","10y","max"]);
  const allowedIntervals = new Set(["1d","1wk","1mo"]);
  const range = allowedRanges.has(args?.range) ? args.range : "1y";
  const interval = allowedIntervals.has(args?.interval) ? args.interval : "1d";
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${interval}&range=${range}`,
      { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } },
    );
    if (!r.ok) return { ok: false, error: `yahoo ${r.status}` };
    const j: any = await r.json();
    const result = j?.chart?.result?.[0];
    if (!result) return { ok: false, error: "no_data" };
    const ts: number[] = result.timestamp ?? [];
    const q = result.indicators?.quote?.[0] ?? {};
    const closes: (number|null)[] = q.close ?? [];
    const highs: (number|null)[] = q.high ?? [];
    const lows: (number|null)[] = q.low ?? [];
    const vols: (number|null)[] = q.volume ?? [];
    // Compact stats so payload stays small
    const valid = closes.map((c, i) => c == null ? null : { d: new Date(ts[i]*1000).toISOString().slice(0,10), c, h: highs[i], l: lows[i], v: vols[i] }).filter(Boolean) as any[];
    const first = valid[0]?.c ?? null;
    const last = valid[valid.length-1]?.c ?? null;
    const high = Math.max(...valid.map(x => x.h ?? -Infinity));
    const low = Math.min(...valid.map(x => x.l ?? Infinity));
    const totalReturnPct = first && last ? ((last - first) / first) * 100 : null;
    // Sample to <= 30 points for the model
    const step = Math.max(1, Math.floor(valid.length / 30));
    const sampled = valid.filter((_, i) => i % step === 0).slice(-30);
    return {
      ok: true, symbol: sym, range, interval, points: valid.length,
      summary: { firstClose: first, lastClose: last, high, low, totalReturnPct },
      sample: sampled,
    };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

async function execGetDisclosures(args: any) {
  const limit = Math.max(1, Math.min(20, Number(args?.limit) || 6));
  const sym = typeof args?.symbol === "string" ? args.symbol.toUpperCase() : null;
  const since = sinceIso(Number(args?.since_days) || 365, 1825);
  let q: any = supabaseAdmin
    .from("official_disclosures")
    .select("ticker, disclosure_type, title, summary, published_at, url, impact_level, sentiment")
    .gte("published_at", since)
    .order("published_at", { ascending: false })
    .limit(limit);
  if (sym) q = q.eq("ticker", sym);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true, count: data?.length ?? 0, since, results: data ?? [] };
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
      ok: true, count: hits.length,
      hits: hits.map((h: any) => ({
        source: h.source_table, symbol: h.symbol,
        similarity: Number(h.similarity ?? 0).toFixed(3),
        when: h.source_created_at,
        content: String(h.content ?? "").slice(0, 600),
      })),
    };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

async function execPaperTradeHistory(args: any, userId: string | null) {
  if (!userId) return { ok: false, error: "user context required" };
  const sym = typeof args?.symbol === "string" ? args.symbol.toUpperCase() : null;
  const since = sinceIso(Number(args?.since_days) || 365, 1825);
  const limit = Math.max(1, Math.min(100, Number(args?.limit) || 20));
  let q: any = supabaseAdmin
    .from("paper_orders")
    .select("symbol, side, qty, price, status, filled_at, created_at, agent_id, realized_pnl")
    .eq("user_id", userId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (sym) q = q.eq("symbol", sym);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true, count: data?.length ?? 0, since, orders: data ?? [] };
}

async function execAIDecisionHistory(args: any, userId: string | null) {
  if (!userId) return { ok: false, error: "user context required" };
  const sym = typeof args?.symbol === "string" ? args.symbol.toUpperCase() : null;
  const since = sinceIso(Number(args?.since_days) || 30, 365);
  const limit = Math.max(1, Math.min(50, Number(args?.limit) || 15));
  // Scope by this user's agents
  const { data: agents } = await supabaseAdmin
    .from("ai_trade_agents").select("id").eq("user_id", userId);
  const agentIds = (agents ?? []).map((a: any) => a.id);
  if (agentIds.length === 0) return { ok: true, count: 0, decisions: [] };
  let q: any = supabaseAdmin
    .from("ai_agent_decisions")
    .select("symbol, action, blocked_reason, calibrated_confidence, strategy_name, created_at")
    .in("agent_id", agentIds)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (sym) q = q.eq("symbol", sym);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true, count: data?.length ?? 0, since, decisions: data ?? [] };
}

async function execScrapeNewsNow() {
  try {
    const { runNewsIngest } = await import("@/lib/news-pipeline-runner.server");
    const res = await runNewsIngest({ trigger: "ai_chat_tool" } as any);
    return {
      ok: true,
      status: res.status,
      fetched: res.fetched_count,
      inserted: res.inserted_count,
      sources_ok: res.successful_sources,
      sources_failed: res.failed_sources,
      duration_ms: res.duration_ms,
    };
  } catch (e: any) {
    return { ok: false, error: String(e?.message ?? e) };
  }
}

async function execScrapeFundamentalNow(args: any) {
  const sym = String(args?.symbol ?? "").toUpperCase();
  if (!sym) return { ok: false, error: "symbol required" };
  try {
    const { backfillSymbol } = await import("@/lib/fundamental-backfill.server");
    const res = await backfillSymbol(sym);
    return { ok: true, symbol: sym, result: res };
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
    case "get_fundamental_history": return execGetFundamentalHistory(args);
    case "get_live_price": return execGetLivePrice(args);
    case "get_price_history": return execGetPriceHistory(args);
    case "get_disclosures": return execGetDisclosures(args);
    case "search_knowledge": return execSearchKnowledge(args, ctx.userId);
    case "get_paper_trade_history": return execPaperTradeHistory(args, ctx.userId);
    case "get_ai_decision_history": return execAIDecisionHistory(args, ctx.userId);
    case "scrape_news_now": return execScrapeNewsNow();
    case "scrape_fundamental_now": return execScrapeFundamentalNow(args);
    default: return { ok: false, error: `unknown tool: ${name}` };
  }
}
