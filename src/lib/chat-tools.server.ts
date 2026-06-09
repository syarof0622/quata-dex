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
  {
    type: "function",
    function: {
      name: "get_market_regime",
      description: "Snapshot rezim pasar IHSG terbaru: trend, volatility, breadth, klasifikasi risk-on/risk-off, advancers/decliners. Sumber: market_regime_snapshots.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_sector_rotation",
      description: "Sector strength terbaru: sektor terkuat/terlemah, momentum, breadth, top symbols. Sumber: sector_strength_snapshots.",
      parameters: {
        type: "object",
        properties: { limit: { type: "number", description: "Default 11, max 20." } },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_portfolio_risk",
      description: "Snapshot risiko portofolio user terbaru: exposure, drawdown, cash%, konsentrasi HHI, max position weight, daily P/L, warnings. Sumber: portfolio_risk_snapshots.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_open_positions",
      description: "Posisi terbuka user (paper_positions) dengan qty, avg_price, source, opened_at, agent_id. Untuk pertanyaan portofolio/open positions.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_trade_plan",
      description: "Trade plan AI untuk simbol (swing_trade_plans): entry zone, SL/TP, trailing, invalidation, R/R, status. Untuk pertanyaan 'plan AI untuk X'.",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string" },
          limit: { type: "number", description: "Default 5, max 20." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_source_health",
      description: "Status sumber data berita (news_source_health): segar/stale/failed/quota_protected/fallback. Untuk pertanyaan kesehatan data/sumber.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_strategy_performance",
      description: "Performance per strategi agent user (strategy_health): trades, win/loss, profit_factor, status, consec_losses. Untuk pertanyaan strategi/Swing Max/Recovery/Expert Mode.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_market_calendar",
      description: "Status sesi IDX saat ini: open / lunch_break / closing_auction / closed / weekend. Dihitung dari waktu WIB sekarang.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "get_macro_context",
      description: "Konteks makro Indonesia (BI rate, inflasi, rupiah, yield, indeks global). STUB — belum dikonfigurasi.",
      parameters: { type: "object", properties: {} },
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

async function execGetMarketRegime() {
  const { data, error } = await supabaseAdmin
    .from("market_regime_snapshots")
    .select("regime_trend, regime_volatility, regime_breadth, regime_classification, idx_level, idx_change_pct, breadth_pct, advancers, decliners, reasoning, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: true, data_state: "QUERY_EMPTY", message: "Belum ada snapshot rezim pasar." };
  return { ok: true, data_state: "VALID_DATA", regime: data };
}

async function execGetSectorRotation(args: any) {
  const limit = Math.max(1, Math.min(20, Number(args?.limit) || 11));
  // Take latest distinct sector by created_at
  const { data, error } = await supabaseAdmin
    .from("sector_strength_snapshots")
    .select("sector, relative_strength, momentum_score, breadth_score, classification, top_symbols, reasoning, created_at")
    .order("created_at", { ascending: false })
    .limit(limit * 4);
  if (error) return { ok: false, error: error.message };
  const seen = new Set<string>();
  const latest = [] as any[];
  for (const r of data ?? []) {
    if (seen.has((r as any).sector)) continue;
    seen.add((r as any).sector);
    latest.push(r);
    if (latest.length >= limit) break;
  }
  if (latest.length === 0) return { ok: true, data_state: "QUERY_EMPTY", sectors: [] };
  return { ok: true, data_state: "VALID_DATA", count: latest.length, sectors: latest };
}

async function execGetPortfolioRisk(_args: any, userId: string | null) {
  if (!userId) return { ok: false, error: "user context required" };
  const { data: acct } = await supabaseAdmin
    .from("paper_accounts").select("id").eq("user_id", userId).limit(1).maybeSingle();
  if (!acct) return { ok: true, data_state: "QUERY_EMPTY", message: "No paper account" };
  const { data, error } = await supabaseAdmin
    .from("portfolio_risk_snapshots")
    .select("gross_exposure, net_exposure, cash_pct, concentration_hhi, max_position_weight, sector_concentration, current_drawdown, daily_pnl, daily_pnl_pct, trades_today, risk_level, warnings, equity_snapshot, cash_snapshot, holdings_value_snapshot, realized_pnl_snapshot, unrealized_pnl_snapshot, created_at")
    .eq("paper_account_id", (acct as any).id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: true, data_state: "QUERY_EMPTY", message: "Belum ada snapshot risiko." };
  return { ok: true, data_state: "VALID_DATA", risk: data };
}

async function execGetOpenPositions(_args: any, userId: string | null) {
  if (!userId) return { ok: false, error: "user context required" };
  const { data, error } = await supabaseAdmin
    .from("paper_positions")
    .select("symbol, qty, avg_price, source, opened_at, opened_by_agent_id, account_id")
    .eq("user_id", userId)
    .order("opened_at", { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data_state: data?.length ? "VALID_DATA" : "QUERY_EMPTY", count: data?.length ?? 0, positions: data ?? [] };
}

async function execGetTradePlan(args: any, userId: string | null) {
  if (!userId) return { ok: false, error: "user context required" };
  const sym = typeof args?.symbol === "string" ? args.symbol.toUpperCase() : null;
  const limit = Math.max(1, Math.min(20, Number(args?.limit) || 5));
  const { data: agents } = await supabaseAdmin
    .from("ai_trade_agents").select("id").eq("user_id", userId);
  const agentIds = (agents ?? []).map((a: any) => a.id);
  if (agentIds.length === 0) return { ok: true, data_state: "QUERY_EMPTY", plans: [] };
  let q: any = supabaseAdmin
    .from("swing_trade_plans")
    .select("symbol, entry_type, entry_price, entry_zone_low, entry_zone_high, stop_loss, take_profit_1, take_profit_2, trailing_stop, invalidation_level, risk_reward_ratio, swing_quality_score, target_holding_days, max_holding_days, status, reasons, warnings, blocked_reason, market_regime, strategy, realized_pnl, exit_reason, created_at, updated_at")
    .in("agent_id", agentIds)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (sym) q = q.eq("symbol", sym);
  const { data, error } = await q;
  if (error) return { ok: false, error: error.message };
  return { ok: true, data_state: data?.length ? "VALID_DATA" : "QUERY_EMPTY", count: data?.length ?? 0, plans: data ?? [] };
}

async function execGetSourceHealth() {
  const { data, error } = await supabaseAdmin
    .from("news_source_health")
    .select("source_key, source_name, source_type, status, last_success_at, last_failed_at, last_message, http_status, fetched_count_24h, inserted_count_24h, fallback_active, quota_protected, disabled, consecutive_failures, updated_at")
    .order("updated_at", { ascending: false });
  if (error) return { ok: false, error: error.message };
  const sources = data ?? [];
  const healthy = sources.filter((s: any) => s.status === "healthy" || s.status === "ok").length;
  const stale = sources.filter((s: any) => s.status === "stale").length;
  const failed = sources.filter((s: any) => s.status === "failed" || s.status === "error").length;
  const quotaProtected = sources.filter((s: any) => s.quota_protected).length;
  return {
    ok: true,
    data_state: sources.length ? "VALID_DATA" : "QUERY_EMPTY",
    summary: { total: sources.length, healthy, stale, failed, quota_protected: quotaProtected },
    sources,
  };
}

async function execGetStrategyPerformance(_args: any, userId: string | null) {
  if (!userId) return { ok: false, error: "user context required" };
  const { data, error } = await supabaseAdmin
    .from("strategy_health")
    .select("strategy, trades, wins, losses, consec_losses, gross_profit, gross_loss, avg_return, profit_factor, status, paused_reason, paused_at, last_trade_at, updated_at")
    .eq("user_id", userId)
    .order("trades", { ascending: false });
  if (error) return { ok: false, error: error.message };
  const rows = data ?? [];
  return {
    ok: true,
    data_state: rows.length ? "VALID_DATA" : "QUERY_EMPTY",
    count: rows.length,
    strategies: rows.map((r: any) => ({
      ...r,
      win_rate: r.trades > 0 ? Math.round((r.wins / r.trades) * 1000) / 10 : null,
      sample_quality: r.trades >= 20 ? "valid" : r.trades >= 5 ? "small" : "insufficient_sample",
    })),
  };
}

async function execGetMarketCalendar() {
  // Compute current IDX session from WIB clock (no holiday calendar).
  const now = new Date();
  const wib = new Date(now.getTime() + 7 * 3600_000);
  const dow = wib.getUTCDay(); // 0=Sun..6=Sat
  const h = wib.getUTCHours();
  const m = wib.getUTCMinutes();
  const mins = h * 60 + m;
  let session: "weekend" | "closed" | "open" | "lunch_break" | "closing_auction";
  if (dow === 0 || dow === 6) session = "weekend";
  else if (mins < 9 * 60) session = "closed";
  else if (mins < 11 * 60 + 30) session = "open";
  else if (mins < 13 * 60 + 30) session = "lunch_break";
  else if (mins < 15 * 60) session = "open";
  else if (mins < 15 * 60 + 15) session = "closing_auction";
  else session = "closed";
  return {
    ok: true,
    data_state: "VALID_DATA",
    session,
    wib_time: `${String(wib.getUTCHours()).padStart(2,"0")}:${String(wib.getUTCMinutes()).padStart(2,"0")} WIB`,
    note: "Hari libur khusus IDX tidak diperhitungkan; status sesi bisa salah saat libur nasional.",
  };
}

async function execGetMacroContext() {
  return {
    ok: true,
    data_state: "NOT_CONFIGURED",
    reason: "Sumber makro (BI rate, inflasi, rupiah, yield, indeks global) belum dihubungkan ke database.",
    required_sources: ["BI rate feed", "BPS CPI feed", "FX rate (USD/IDR)", "INDOGB 10Y yield", "Global indices (S&P, Nikkei, Hang Seng)"],
  };
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
    case "get_market_regime": return execGetMarketRegime();
    case "get_sector_rotation": return execGetSectorRotation(args);
    case "get_portfolio_risk": return execGetPortfolioRisk(args, ctx.userId);
    case "get_open_positions": return execGetOpenPositions(args, ctx.userId);
    case "get_trade_plan": return execGetTradePlan(args, ctx.userId);
    case "get_source_health": return execGetSourceHealth();
    case "get_strategy_performance": return execGetStrategyPerformance(args, ctx.userId);
    case "get_market_calendar": return execGetMarketCalendar();
    case "get_macro_context": return execGetMacroContext();
    default: return { ok: false, error: `unknown tool: ${name}` };
  }
}

// ---------------- Audit logging ----------------

export async function logToolRun(row: {
  userId: string | null;
  conversationId: string | null;
  question: string | null;
  intent: string | null;
  toolName: string;
  toolInput: unknown;
  toolOutput: unknown;
  status: string;
  dataState: string | null;
  durationMs: number;
  errorMessage: string | null;
}): Promise<void> {
  try {
    const summary = summarizeToolOutput(row.toolOutput);
    await supabaseAdmin.from("ai_tool_runs").insert({
      user_id: row.userId,
      conversation_id: row.conversationId,
      question: row.question ? String(row.question).slice(0, 2000) : null,
      intent: row.intent,
      tool_name: row.toolName,
      tool_input: typeof row.toolInput === "object" ? row.toolInput as any : { raw: String(row.toolInput ?? "") },
      tool_output_summary: summary,
      status: row.status,
      data_state: row.dataState,
      duration_ms: row.durationMs,
      error_message: row.errorMessage,
    });
  } catch (e) {
    console.error("[ai_tool_runs] insert failed", e);
  }
}

function summarizeToolOutput(out: unknown): string {
  if (!out || typeof out !== "object") return String(out ?? "").slice(0, 800);
  const o = out as Record<string, any>;
  const parts: string[] = [];
  if ("ok" in o) parts.push(`ok=${o.ok}`);
  if ("data_state" in o) parts.push(`state=${o.data_state}`);
  if ("count" in o) parts.push(`count=${o.count}`);
  if ("symbol" in o) parts.push(`symbol=${o.symbol}`);
  if ("found" in o) parts.push(`found=${o.found}`);
  if ("error" in o && o.error) parts.push(`error=${String(o.error).slice(0, 120)}`);
  if ("session" in o) parts.push(`session=${o.session}`);
  if ("status" in o && typeof o.status === "string") parts.push(`status=${o.status}`);
  return (parts.join(" ") || JSON.stringify(o).slice(0, 400)).slice(0, 800);
}

