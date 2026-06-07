import { createServerFn } from "@tanstack/react-start";
import { currentUserId } from "@/lib/current-user.server";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { GLOBAL_FUNDAMENTAL_GUARD } from "@/lib/ai-fundamental-guard";


export const listJournal = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin.from("trade_journal")
    .select("*").eq("user_id", currentUserId()).order("created_at", { ascending: false }).limit(200);
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const updateJournal = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; setup?: string; emotion?: string; notes?: string; tags?: string[] }) => z.object({
    id: z.string().uuid(),
    setup: z.string().max(120).optional(),
    emotion: z.string().max(40).optional(),
    notes: z.string().max(2000).optional(),
    tags: z.array(z.string().max(40)).max(10).optional(),
  }).parse(d))
  .handler(async ({ data }) => {
    const patch: { setup?: string; emotion?: string; notes?: string; tags?: string[] } = {};
    if (data.setup !== undefined) patch.setup = data.setup;
    if (data.emotion !== undefined) patch.emotion = data.emotion;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.tags !== undefined) patch.tags = data.tags;
    const { error } = await supabaseAdmin.from("trade_journal")
      .update(patch).eq("id", data.id).eq("user_id", currentUserId());
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const journalStats = createServerFn({ method: "GET" }).handler(async () => {
  const { data } = await supabaseAdmin.from("trade_journal")
    .select("symbol,side,qty,price,pnl,pnl_pct,created_at,setup")
    .eq("user_id", currentUserId()).order("created_at", { ascending: false }).limit(500);
  const rows = data ?? [];
  const closed = rows.filter(r => r.pnl != null);
  const wins = closed.filter(r => Number(r.pnl) > 0);
  const losses = closed.filter(r => Number(r.pnl) <= 0);
  const totalPnl = closed.reduce((a, r) => a + Number(r.pnl ?? 0), 0);
  const winRate: number | null = closed.length ? (wins.length / closed.length) * 100 : null;
  const avgWin = wins.length ? wins.reduce((a, r) => a + Number(r.pnl), 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((a, r) => a + Number(r.pnl), 0) / losses.length : 0;
  const expectancy = closed.length ? totalPnl / closed.length : 0;
  const bySetup: Record<string, { trades: number; wins: number; pnl: number }> = {};
  for (const r of closed) {
    const k = r.setup || "untagged";
    bySetup[k] ??= { trades: 0, wins: 0, pnl: 0 };
    bySetup[k].trades++;
    if (Number(r.pnl) > 0) bySetup[k].wins++;
    bySetup[k].pnl += Number(r.pnl ?? 0);
  }
  return {
    total: rows.length, closed: closed.length,
    winRate, totalPnl, avgWin, avgLoss, expectancy,
    bySetup, recent: rows.slice(0, 20),
  };
});

export const aiReviewJournal = createServerFn({ method: "POST" })
  .inputValidator((d: { id?: string; mode?: "trade" | "session" }) =>
    z.object({ id: z.string().uuid().optional(), mode: z.enum(["trade", "session"]).optional().default("session") }).parse(d ?? {}))
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI gateway not configured");
    let prompt = "";
    let target: any = null;
    if (data.mode === "trade" && data.id) {
      const { data: row } = await supabaseAdmin.from("trade_journal").select("*").eq("id", data.id).eq("user_id", currentUserId()).single();
      if (!row) throw new Error("Trade not found");
      target = row;
      prompt = `Review this single trade and grade A-F.

Symbol: ${row.symbol}
Side: ${row.side}
Qty: ${row.qty} @ ${row.price}
PnL: ${row.pnl ?? "open"} (${row.pnl_pct ?? "?"}%)
Setup: ${row.setup ?? "n/a"}
Emotion: ${row.emotion ?? "n/a"}
Notes: ${row.notes ?? "n/a"}

Output markdown with: Grade, What went right, What went wrong, Lesson, Next-time checklist.`;
    } else {
      const { data: rows } = await supabaseAdmin.from("trade_journal").select("*").eq("user_id", currentUserId()).order("created_at", { ascending: false }).limit(30);
      const closed = (rows ?? []).filter(r => r.pnl != null);
      if (closed.length < 3) throw new Error("Need at least 3 closed trades for a session review");
      const summary = closed.map(r => `${r.symbol} ${r.side} ${r.qty}@${r.price} → PnL ${r.pnl} (${r.pnl_pct}%) setup=${r.setup ?? "?"} emo=${r.emotion ?? "?"}`).join("\n");
      prompt = `You are a trading psychology + risk coach. Review the last ${closed.length} trades and produce:
- Win rate, average R, observations on sizing
- Top 2 strengths
- Top 3 weaknesses
- Concrete checklist for next 5 trades

Trades:
${summary}`;
    }
    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: `${GLOBAL_FUNDAMENTAL_GUARD}\n\nYou are an institutional trading coach. Be direct, specific, and actionable. Use markdown. Never invent fundamental ratios (PER/PBV/ROE/DER) or value-trap labels — follow the GLOBAL FUNDAMENTAL & DISCLOSURE GUARD above.` },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!r.ok) {
      if (r.status === 429) throw new Error("Rate limited");
      if (r.status === 402) throw new Error("Out of AI credits");
      throw new Error("AI failed");
    }
    const j = await r.json();
    const review = j.choices?.[0]?.message?.content ?? "No response.";
    if (data.mode === "trade" && target) {
      await supabaseAdmin.from("trade_journal").update({ ai_review: review }).eq("id", target.id);
    }
    return { review };
  });
