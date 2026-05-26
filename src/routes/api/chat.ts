import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getAIAppContext } from "@/lib/ai-app-context.server";

// Extract IDX-style tickers (3-4 uppercase letters, optional .JK) from text.
function extractTickers(text: string): string[] {
  const found = new Set<string>();
  const re = /\b([A-Z]{3,5})(?:\.JK)?\b/g;
  let m: RegExpExecArray | null;
  const stop = new Set(["IDX", "IHSG", "BEI", "AI", "USD", "IDR", "GDP", "CPI", "PMI", "ETF", "IPO", "ESG", "USA", "RBI", "RBA", "ECB", "BOJ"]);
  while ((m = re.exec(text)) !== null) {
    const t = m[1];
    if (t.length >= 3 && t.length <= 4 && !stop.has(t)) found.add(`${t}.JK`);
  }
  return [...found].slice(0, 4);
}

// Build a compact, AI-friendly context block from public news + sentiment.
async function buildMarketContext(userText: string): Promise<string> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const tickers = extractTickers(userText);

  // 1) Market-wide sentiment snapshot (last 24h)
  const { data: sentimentRows } = await supabaseAdmin
    .from("news_articles")
    .select("sentiment, sentiment_score, impact_level")
    .gte("published_at", since)
    .eq("is_duplicate", false);
  let pos = 0, neg = 0, neu = 0, sumScore = 0, high = 0;
  for (const r of (sentimentRows ?? []) as any[]) {
    if (r.sentiment === "positive") pos++;
    else if (r.sentiment === "negative") neg++;
    else neu++;
    sumScore += Number(r.sentiment_score ?? 0);
    if (r.impact_level === "high") high++;
  }
  const total = pos + neg + neu;
  const avg = total ? Math.round((sumScore / total) * 100) : 0;
  const bias = avg > 30 ? "Bullish" : avg > 10 ? "Mildly Bullish" : avg < -30 ? "Bearish" : avg < -10 ? "Mildly Bearish" : "Neutral";

  // 2) Top high-impact headlines (latest 8)
  const { data: topNews } = await supabaseAdmin
    .from("news_articles")
    .select("title, source, sentiment, impact_level, published_at, tickers")
    .eq("is_duplicate", false)
    .order("published_at", { ascending: false })
    .limit(20);
  const headlines = (topNews ?? [])
    .slice(0, 8)
    .map((n: any) => `- [${n.source}|${n.sentiment}|${n.impact_level}] ${String(n.title).slice(0, 140)}${n.tickers?.length ? ` (${(n.tickers as string[]).slice(0, 3).join(", ")})` : ""}`)
    .join("\n");

  // 3) Ticker-specific context if mentioned
  let perTicker = "";
  if (tickers.length) {
    const { data: tNews } = await supabaseAdmin
      .from("news_articles")
      .select("title, source, sentiment, sentiment_score, impact_level, published_at, tickers")
      .overlaps("tickers", tickers)
      .eq("is_duplicate", false)
      .order("published_at", { ascending: false })
      .limit(12);
    const { data: tSum } = await supabaseAdmin
      .from("ticker_sentiment_summary")
      .select("symbol, positive_count, negative_count, neutral_count, average_sentiment_score, high_impact_news_count, latest_news_at")
      .in("symbol", tickers);
    const sumLines = (tSum ?? [])
      .map((s: any) => `- ${s.symbol}: avg=${s.average_sentiment_score} pos=${s.positive_count} neg=${s.negative_count} neu=${s.neutral_count} high-impact=${s.high_impact_news_count}`)
      .join("\n");
    const tLines = (tNews ?? [])
      .map((n: any) => `- [${n.source}|${n.sentiment}|${n.impact_level}] ${String(n.title).slice(0, 140)}`)
      .join("\n");
    perTicker = `\n\nTICKER FOCUS (${tickers.join(", ")}):\n${sumLines || "(no 24h summary)"}\n${tLines || "(no recent ticker news)"}`;
  }

  return `LIVE MARKET CONTEXT (public sources, last 24h)
Sentiment: ${bias} (score ${avg}) — positive:${pos} neutral:${neu} negative:${neg} high-impact:${high}
Top headlines:
${headlines || "(no recent headlines)"}${perTicker}`;
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { messages, system } = await request.json() as {
            messages: { role: "user" | "assistant"; content: string }[];
            system?: string;
          };
          if (!Array.isArray(messages) || messages.length === 0) {
            return new Response(JSON.stringify({ error: "messages required" }), { status: 400 });
          }
          if (messages.length > 40) {
            return new Response(JSON.stringify({ error: "Too many messages" }), { status: 400 });
          }
          for (const m of messages) {
            if (!m || typeof m.content !== "string" || (m.role !== "user" && m.role !== "assistant")) {
              return new Response(JSON.stringify({ error: "invalid message" }), { status: 400 });
            }
            if (m.content.length > 8000) {
              return new Response(JSON.stringify({ error: "message too long" }), { status: 400 });
            }
          }
          const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
          if (!LOVABLE_API_KEY) {
            return new Response(JSON.stringify({ error: "AI gateway not configured" }), { status: 500 });
          }

          const safeSystem = typeof system === "string" && system.length > 0 && system.length <= 2000 ? system : undefined;
          const baseSystem = safeSystem ?? `You are the AI Trading Analyst inside Quanta Terminal, an institutional-grade IDX (Indonesia Stock Exchange) paper-trading workstation.

You have two grounding blocks:
1. LIVE MARKET CONTEXT — public news + sentiment snapshot (last 24h).
2. APP CONTEXT — JSON snapshot of THIS user's app state: portfolio, paper trading account, open positions, AI Trade Agent decisions, autonomous scanner candidates, watchlist, news/sentiment, undervalue scores, alerts, backtest, journal, data quality, source health, and market session.

Grounding rules (STRICT):
- Treat APP CONTEXT as the source of truth for anything about THIS user. Never invent positions, orders, decisions, watchlist symbols, alerts, or PnL.
- If a section is empty / stale / error / unavailable, say so plainly instead of guessing.
- Distinguish: executed paper order vs open position vs closed trade vs blocked buy intent vs watch candidate vs research snapshot vs no trade.
- Say HOLD only when an open position for that symbol exists in portfolio.openPositions.
- Say BUY only when a matching paper order shows status=filled. If a buy was blocked, call it "buy intent blocked" and cite the blocked reason.
- All trading is PAPER TRADING only — never suggest the user actually wired real money.
- If user requests a write action (place order, reset account, pause/stop agent, add alert/watchlist, delete), DO NOT claim it's done. Outline the plan and ask for confirmation; the user will execute it from the UI.
- Reply in the same language as the user's last message (Indonesian → Indonesian, English → English).

Recommendation rules:
- Before recommending a buy, sanity-check market.executionAllowed, portfolio.cash, portfolio.openPositionsCount vs limits, data freshness, and risk warnings.
- Prefer candidates that already appear in autonomousScanner.topCandidates or screener with valid execution eligibility.
- If data is insufficient, say so — do not fabricate fundamentals, technicals, or undervalue classification.

OUTPUT FORMAT — strict GitHub-Flavored Markdown (renderer supports tables, lists, blockquotes, headings, badges):
- Use ## headings as appropriate. Suggested sets:
  Portfolio Q → ## Ringkasan Portfolio, ## Open Positions, ## Risiko Utama, ## Saran Aksi, ## Data Context
  AI Agent Q → ## Status Agent, ## Keputusan Terakhir, ## Why BUY / Why No BUY, ## Open Positions, ## Blocked Reasons, ## Worker Status
  Ticker Q → ## Snapshot, ## Technical, ## News & Sentiment, ## Fundamental, ## Signal, ## Entry Plan, ## Risk
  Recommendation Q → ## Market Summary, ## Top Picks, ## Entry Plan, ## Risiko & Mitigasi, ## Data Freshness, ## Catatan Paper Trading
- For stock recommendation tables, use the exact header:
  | Ticker | Sector | Signal | Entry Zone | Stop Loss | Take Profit | Confidence | Rationale |
  Signal MUST be one of: STRONG BUY, BUY, ACCUMULATE, TACTICAL BUY, WATCH, HOLD, AVOID, HIGH RISK.
- Never produce broken pipe tables. Each row starts with a single "|" and ends with "|". Include separator "|---|...".
- Close with a "> Disclaimer" blockquote — educational simulation, not financial advice.`;

          // Pull public news + sentiment context from the last user turn
          const lastUser = [...messages].reverse().find(m => m.role === "user")?.content ?? "";
          let marketContextBlock = "";
          try { marketContextBlock = await buildMarketContext(lastUser); }
          catch (e) { console.error("buildMarketContext failed", e); }

          let appContextBlock = "";
          try {
            const appCtx = await getAIAppContext(lastUser);
            appContextBlock = `APP CONTEXT (internal app state for this user — JSON):\n${JSON.stringify(appCtx)}`;
          } catch (e) {
            console.error("getAIAppContext failed", e);
            appContextBlock = `APP CONTEXT: unavailable (internal error). Tell the user app data could not be loaded right now.`;
          }

          const sys = [baseSystem, marketContextBlock, appContextBlock].filter(Boolean).join("\n\n");

          const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-3-flash-preview",
              messages: [{ role: "system", content: sys }, ...messages],
              stream: true,
            }),
          });

          if (!upstream.ok) {
            if (upstream.status === 429) return new Response(JSON.stringify({ error: "Rate limited. Try again shortly." }), { status: 429 });
            if (upstream.status === 402) return new Response(JSON.stringify({ error: "Out of AI credits. Add more in Settings → Workspace → Usage." }), { status: 402 });
            const t = await upstream.text();
            console.error("AI gateway error", upstream.status, t);
            return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500 });
          }

          return new Response(upstream.body, { headers: { "Content-Type": "text/event-stream" } });
        } catch (e) {
          console.error("chat route error", e);
          return new Response(JSON.stringify({ error: "Unknown error" }), { status: 500 });
        }
      },
    },
  },
});
