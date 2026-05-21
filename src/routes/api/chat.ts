import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
          const baseSystem = safeSystem ?? `You are an institutional-grade trading analyst AI inside a Bloomberg-style IDX terminal.
Ground every answer in the LIVE MARKET CONTEXT block below (public news + sentiment from the platform's database). Cite headlines briefly when relevant.
Explain with technical + fundamental reasoning, give risk-aware trade ideas in IDR for IDX tickers, and never give financial advice.
Use concise markdown with bullets and small tables. Always include a "Risks" section.`;

          // Pull public news + sentiment context from the last user turn
          const lastUser = [...messages].reverse().find(m => m.role === "user")?.content ?? "";
          let contextBlock = "";
          try { contextBlock = await buildMarketContext(lastUser); }
          catch (e) { console.error("buildMarketContext failed", e); }

          const sys = contextBlock ? `${baseSystem}\n\n${contextBlock}` : baseSystem;

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
