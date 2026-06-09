// Intent classifier + tool routing hints + freshness/confidence helpers.
// Pure functions, no I/O. SERVER ONLY (named .server.ts).

export type ChatIntent =
  | "stock_analysis"
  | "undervalue_analysis"
  | "price_action_analysis"
  | "news_sentiment_analysis"
  | "disclosure_analysis"
  | "portfolio_review"
  | "trade_history_review"
  | "ai_agent_diagnosis"
  | "strategy_review"
  | "data_health_question"
  | "broad_market_question"
  | "general_question";

const KW: Record<Exclude<ChatIntent, "general_question" | "stock_analysis">, RegExp> = {
  undervalue_analysis: /\b(undervalue|undervalued|murah|diskon|valuasi|value\s*trap|per\b|pbv\b|fundamental(?:ly)?)\b/i,
  price_action_analysis: /\b(chart|grafik|tren(d)?|support|resistance|breakout|ohlcv|candle|harga\s+saham|pergerakan|moving\s*average|ma\d+|rsi|macd)\b/i,
  news_sentiment_analysis: /\b(berita|news|sentimen|sentiment|katalis|headline|rumor)\b/i,
  disclosure_analysis: /\b(disclosure|idx|bei|rups|dividen|dividend|rights?\s*issue|buyback|suspensi|suspension|uma|corporate\s*action|stock\s*split|merger|akuisisi|laporan\s+keuangan)\b/i,
  portfolio_review: /\b(portof?olio|posisi\s+saya|cash\s+saya|saldo|drawdown|p\/?l|loss\s+saya|alokasi|exposure|risiko\s+portofolio)\b/i,
  trade_history_review: /\b(trade\s+(saya|terakhir|sebelumnya)|riwayat\s+trade|paper\s+trade|win\s+rate|kenapa\s+(trade|saham)\s+(loss|merugi|untung))\b/i,
  ai_agent_diagnosis: /\b(ai\s*agent|agent\s+(beli|jual|tahan|blokir|block|pause|stop|tidak\s*beli|belum\s*beli)|kenapa\s+ai|auto\s*trade)\b/i,
  strategy_review: /\b(swing\s*max|recovery|expert\s*mode|strategi|strategy|profit\s*factor|sharpe|win\s*rate\s+strategi)\b/i,
  data_health_question: /\b(data\s+(stale|basi|usang|fresh|segar|missing|kosong)|source\s*health|pipeline|worker|sumber\s+(berita|fundamental)|tidak\s+update)\b/i,
  broad_market_question: /\b(ihsg|jci|market\s+regime|sector\s+rotation|risk[\s-]*on|risk[\s-]*off|global\s+market|makro|bi\s*rate|inflasi|rupiah)\b/i,
};

export function classifyIntent(text: string): { intent: ChatIntent; tickers: string[] } {
  const t = String(text || "");
  const tickers = extractTickers(t);

  // Order matters: more specific first.
  if (KW.disclosure_analysis.test(t)) return { intent: "disclosure_analysis", tickers };
  if (KW.undervalue_analysis.test(t)) return { intent: "undervalue_analysis", tickers };
  if (KW.ai_agent_diagnosis.test(t)) return { intent: "ai_agent_diagnosis", tickers };
  if (KW.trade_history_review.test(t)) return { intent: "trade_history_review", tickers };
  if (KW.portfolio_review.test(t)) return { intent: "portfolio_review", tickers };
  if (KW.strategy_review.test(t)) return { intent: "strategy_review", tickers };
  if (KW.data_health_question.test(t)) return { intent: "data_health_question", tickers };
  if (KW.news_sentiment_analysis.test(t)) return { intent: "news_sentiment_analysis", tickers };
  if (KW.price_action_analysis.test(t)) return { intent: "price_action_analysis", tickers };
  if (KW.broad_market_question.test(t)) return { intent: "broad_market_question", tickers };
  if (tickers.length > 0) return { intent: "stock_analysis", tickers };
  return { intent: "general_question", tickers };
}

function extractTickers(text: string): string[] {
  const found = new Set<string>();
  const re = /\b([A-Z]{3,5})(?:\.JK)?\b/g;
  const stop = new Set(["IDX","IHSG","BEI","AI","USD","IDR","GDP","CPI","PMI","ETF","IPO","ESG","USA","RBI","RBA","ECB","BOJ","RUPS","UMA","PER","PBV","ROE","ROA","DER","EPS","OHLC","OHLCV","SL","TP","MA","RSI","MACD"]);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const t = m[1];
    if (t.length >= 3 && t.length <= 4 && !stop.has(t)) found.add(`${t}.JK`);
  }
  return [...found].slice(0, 4);
}

export function toolBudgetFor(intent: ChatIntent): number {
  switch (intent) {
    case "general_question":
      return 3;
    case "stock_analysis":
    case "undervalue_analysis":
    case "ai_agent_diagnosis":
    case "portfolio_review":
      return 8;
    default:
      return 5;
  }
}

const CHAIN: Record<ChatIntent, string[]> = {
  stock_analysis:        ["get_live_price","get_price_history","get_fundamental","get_fundamental_history","search_news","get_disclosures","search_knowledge"],
  undervalue_analysis:   ["get_fundamental","get_fundamental_history","get_disclosures","search_news","get_live_price","scrape_fundamental_now"],
  price_action_analysis: ["get_live_price","get_price_history","search_news","get_disclosures"],
  news_sentiment_analysis:["search_news","scrape_news_now","get_live_price"],
  disclosure_analysis:   ["get_disclosures","search_news","scrape_news_now"],
  portfolio_review:      ["get_open_positions","get_portfolio_risk","get_paper_trade_history","get_live_price","get_price_history","search_news","get_disclosures","search_knowledge"],
  trade_history_review:  ["get_paper_trade_history","get_ai_decision_history","get_price_history","search_news","get_disclosures"],
  ai_agent_diagnosis:    ["get_ai_decision_history","get_paper_trade_history","get_trade_plan","get_live_price","get_price_history","search_news","get_disclosures","search_knowledge"],
  strategy_review:       ["get_strategy_performance","get_paper_trade_history","get_ai_decision_history","search_knowledge"],
  data_health_question:  ["get_source_health","search_knowledge","get_fundamental","search_news","get_disclosures"],
  broad_market_question: ["get_market_regime","get_sector_rotation","get_market_calendar","search_news","scrape_news_now","search_knowledge"],
  general_question:      [],
};

export function toolChainFor(intent: ChatIntent): string[] {
  return CHAIN[intent] ?? [];
}

export function intentHintBlock(intent: ChatIntent, tickers: string[], budget: number): string {
  const chain = toolChainFor(intent);
  const tickerLine = tickers.length ? `Tickers terdeteksi: ${tickers.join(", ")}` : "Tidak ada ticker spesifik";
  const chainLine = chain.length
    ? `Rantai tools standar untuk intent ini: ${chain.join(" → ")}.`
    : `Intent general — tidak wajib memanggil tool, hanya panggil bila pertanyaan butuh data pasar/aplikasi.`;
  return `INTENT ROUTING (auto-classified):
- Intent: ${intent}
- ${tickerLine}
- ${chainLine}
- Tool budget maksimum: ${budget} iterasi. Hentikan lebih awal bila data sudah cukup.
- Gunakan rantai di atas sebagai panduan, bukan kewajiban — boleh skip tool yang sudah ada di APP CONTEXT.
- WAJIB: cek tool historis dulu sebelum bilang "data tidak tersedia". Scrape hanya bila data missing/stale dan relevan, lalu re-check.`;
}

// ---------- Freshness + Confidence scoring ----------

export type DataState =
  | "NOT_QUERIED" | "QUERY_EMPTY" | "STALE_DATA" | "PARTIAL_DATA"
  | "VALID_DATA" | "SCRAPE_TRIGGERED" | "SCRAPE_FAILED" | "SCRAPE_SUCCESS"
  | "QUOTA_PROTECTED" | "NOT_CONFIGURED";

export function freshnessLabel(kind: "price" | "news" | "fundamental", ageMinutes: number | null): "Segar" | "Cached" | "Usang" | "Tidak Tersedia" | "Parsial" {
  if (ageMinutes == null) return "Tidak Tersedia";
  switch (kind) {
    case "price":
      if (ageMinutes < 5) return "Segar";
      if (ageMinutes < 30) return "Cached";
      return "Usang";
    case "news":
      if (ageMinutes < 6 * 60) return "Segar";
      if (ageMinutes < 24 * 60) return "Parsial";
      return "Usang";
    case "fundamental":
      if (ageMinutes < 90 * 1440) return "Segar";
      if (ageMinutes < 120 * 1440) return "Parsial";
      return "Usang";
  }
}
