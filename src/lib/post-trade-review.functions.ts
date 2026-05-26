// Phase C: Post-Trade Reviewer. Reviews recent closed paper trades, infers
// outcome + lesson label, persists into ai_trade_reviews.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { recordForwardTestFromClosedTrade } from "./strategy-intelligence.functions";
import { sectorOf } from "./sectors";

type LessonLabel =
  | "good_entry_good_exit"
  | "good_entry_late_exit"
  | "good_entry_early_exit"
  | "late_entry_good_exit"
  | "premature_entry"
  | "stop_loss_too_tight"
  | "take_profit_too_close"
  | "ignored_negative_sentiment"
  | "low_data_quality_trade"
  | "regime_misaligned"
  | "value_trap"
  | "well_executed_loss"
  | "pending_review_data"
  | "neutral";

function deriveLesson(pnlPct: number, holdingMinutes: number, ctx: any): LessonLabel {
  const dq = Number(ctx?.data_quality_snapshot?.overall_data_quality_score ?? ctx?.data_quality_snapshot?.overallDataQualityScore ?? 100);
  const sent = Number(ctx?.sentiment_snapshot?.score ?? ctx?.sentiment_snapshot?.average_sentiment_score ?? 0);
  if (pnlPct > 1.5) {
    if (holdingMinutes < 15) return "good_entry_early_exit";
    if (holdingMinutes > 24 * 60) return "good_entry_late_exit";
    return "good_entry_good_exit";
  }
  if (pnlPct < -3) {
    if (dq < 60) return "low_data_quality_trade";
    if (sent < -0.3) return "ignored_negative_sentiment";
    return "well_executed_loss";
  }
  if (pnlPct < -1 && holdingMinutes < 30) return "stop_loss_too_tight";
  if (pnlPct > 0 && pnlPct < 0.5) return "take_profit_too_close";
  return "neutral";
}

const VALID_REVIEW_EVENT_TYPES = new Set([
  "closed_trade",
  "stop_loss_exit",
  "take_profit_exit",
  "risk_exit",
  "manual_sell",
]);

export const runPostTradeReview = createServerFn({ method: "POST" })
  .inputValidator((input: { limit?: number }) => ({
    limit: Math.min(Math.max(input?.limit ?? 25, 1), 100),
  }))
  .handler(async ({ data }) => {
    // Closed paper trades = filled SELL orders. realized_pnl on the SELL order
    // is the SOURCE OF TRUTH. If it's missing/null, mark the review as
    // pending_review_data — NEVER default to breakeven.
    const { data: orders } = await supabaseAdmin
      .from("paper_orders")
      .select("*")
      .eq("status", "filled")
      .eq("side", "sell")
      .order("filled_at", { ascending: false })
      .limit(data.limit);
    if (!orders || orders.length === 0) return { reviewed: 0 };

    const { data: existing } = await supabaseAdmin
      .from("ai_trade_reviews")
      .select("symbol, exit_price")
      .in("symbol", Array.from(new Set(orders.map((o: any) => o.symbol))));
    const reviewedKey = new Set(
      (existing ?? []).map((r: any) => `${r.symbol}_${r.exit_price}`),
    );

    let count = 0;
    for (const o of orders as any[]) {
      const key = `${o.symbol}_${o.filled_price}`;
      if (reviewedKey.has(key)) continue;

      // Pair with most-recent matching training event of an exit-class event type.
      const { data: train } = await supabaseAdmin
        .from("ai_agent_training_events")
        .select("*")
        .eq("symbol", o.symbol)
        .order("created_at", { ascending: false })
        .limit(5);
      const exitEvent = (train ?? []).find(
        (t: any) => !t.event_type || VALID_REVIEW_EVENT_TYPES.has(t.event_type),
      ) ?? (train ?? [])[0] ?? null;

      const exitPrice = Number(o.filled_price ?? o.price ?? 0);
      const qty = Number(o.qty ?? 0);

      // Detect missing realized P/L: column is NULL or non-numeric.
      const realizedRaw = o.realized_pnl;
      const realizedMissing = realizedRaw === null || realizedRaw === undefined
        || !Number.isFinite(Number(realizedRaw));
      const realizedPnl = realizedMissing ? 0 : Number(realizedRaw);

      const aiDec = (exitEvent?.ai_decision ?? {}) as any;
      const aiEntry = Number(aiDec?.entry_price ?? 0);
      const entryPrice =
        qty > 0 && !realizedMissing && realizedPnl !== 0
          ? exitPrice - realizedPnl / qty
          : aiEntry > 0
            ? aiEntry
            : exitPrice;
      const pnlPct =
        entryPrice > 0 && !realizedMissing
          ? ((exitPrice - entryPrice) / entryPrice) * 100
          : 0;
      const holdingMinutes = exitEvent?.created_at
        ? Math.round(
            (new Date(o.filled_at ?? o.created_at).getTime() -
              new Date(exitEvent.created_at).getTime()) /
              60000,
          )
        : 0;

      // Outcome strictly from realized P/L. If realized is missing entirely,
      // mark as pending_review_data so the UI doesn't show a fake breakeven.
      type Outcome = "win" | "loss" | "breakeven" | "pending_review_data";
      const outcome: Outcome = realizedMissing
        ? "pending_review_data"
        : realizedPnl > 0
          ? "win"
          : realizedPnl < 0
            ? "loss"
            : "breakeven";

      const lesson: LessonLabel =
        outcome === "pending_review_data"
          ? "pending_review_data"
          : outcome === "breakeven" && realizedPnl === 0
            ? "neutral"
            : deriveLesson(pnlPct, holdingMinutes, exitEvent ?? {});

      let wentRight: string | null = null;
      let wentWrong: string | null = null;
      if (outcome === "win") {
        wentRight = "Entry pada momentum positif menghasilkan profit.";
        if (lesson === "good_entry_early_exit")
          wentWrong = "Exit terlalu cepat — momentum berlanjut.";
        if (lesson === "good_entry_late_exit")
          wentWrong = "Exit terlambat — sebagian gain tergerus.";
      } else if (outcome === "loss") {
        wentWrong =
          lesson === "low_data_quality_trade"
            ? "Data quality rendah saat keputusan dibuat."
            : lesson === "ignored_negative_sentiment"
              ? "Sentiment negatif diabaikan."
              : lesson === "stop_loss_too_tight"
                ? "Stop loss terlalu rapat — noise harga memicu exit."
                : "Setup gagal — tinjau ulang strategi.";
        if (Number(aiDec?.confidence ?? 0) > 0.7)
          wentRight = "Setup confidence tinggi tetapi market berbalik.";
      } else if (outcome === "breakeven") {
        wentRight = "Realized P/L netral — tidak ada gain/loss material.";
        wentWrong = "Strategi tidak menghasilkan edge yang dapat diukur.";
      } else {
        // pending_review_data
        wentRight = null;
        wentWrong = "Realized P/L belum tersedia — review menunggu data eksekusi final.";
      }

      const aiReview =
        outcome === "pending_review_data"
          ? `Trade ${o.symbol} menunggu data realized P/L. Review akan dihasilkan setelah data eksekusi tersedia.`
          : `Trade ${o.symbol} ditutup ${outcome} (${pnlPct.toFixed(2)}%, realized ${realizedPnl.toFixed(2)}) setelah ${holdingMinutes} menit. Pelajaran: ${lesson}.`;

      const review = {
        agent_id: (exitEvent as any)?.agent_id ?? "00000000-0000-0000-0000-000000000000",
        paper_account_id: o.account_id,
        symbol: o.symbol,
        decision_id: (exitEvent as any)?.decision_id ?? null,
        training_event_id: (exitEvent as any)?.id ?? null,
        entry_price: entryPrice,
        exit_price: exitPrice,
        qty,
        pnl: realizedMissing ? null : realizedPnl,
        pnl_pct: realizedMissing ? null : pnlPct,
        holding_minutes: holdingMinutes,
        outcome,
        lesson_label: lesson,
        what_went_right: wentRight,
        what_went_wrong: wentWrong,
        ai_review: aiReview,
        entry_context: (exitEvent as any)?.real_market_context ?? (exitEvent as any)?.ai_decision ?? null,
        exit_context: {
          exit_price: exitPrice,
          exit_time: o.filled_at,
          realized_pnl: realizedMissing ? null : realizedPnl,
          close_reason: (o as any).close_reason ?? null,
          pending_review_data: realizedMissing,
        },
      };
      await supabaseAdmin.from("ai_trade_reviews").insert(review);

      // Forward-test ingestion: ONLY closed trades feed the strategy
      // forward-test table. Pull strategy attribution from the matched
      // training event's ai_decision blob (or fall back to "unspecified").
      try {
        if (!realizedMissing) {
          const aiDecAny = aiDec as any;
          await recordForwardTestFromClosedTrade({
            paperOrderId: o.id,
            trainingEventId: (exitEvent as any)?.id ?? null,
            symbol: o.symbol,
            sector: sectorOf(o.symbol) ?? null,
            strategyName: aiDecAny?.strategy_name ?? aiDecAny?.strategy ?? null,
            marketRegime: aiDecAny?.market_regime ?? null,
            realizedPnl,
            realizedPnlPct: pnlPct,
            holdingMinutes,
            closeReason: (o as any).close_reason ?? null,
          });
        }
      } catch (e) {
        console.error("[post-trade] forward-test ingest failed", e);
      }

      count += 1;
    }
    return { reviewed: count };
  });

export const listRecentTradeReviews = createServerFn({ method: "GET" })
  .inputValidator((input: { limit?: number }) => ({
    limit: Math.min(Math.max(input?.limit ?? 20, 1), 100),
  }))
  .handler(async ({ data }) => {
    const { data: rows } = await supabaseAdmin
      .from("ai_trade_reviews")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    return rows ?? [];
  });

export const summarizeLessonsLearned = createServerFn({ method: "GET" }).handler(
  async () => {
    const { data: rows } = await supabaseAdmin
      .from("ai_trade_reviews")
      .select("lesson_label, outcome, pnl_pct")
      .order("created_at", { ascending: false })
      .limit(500);
    const counts: Record<string, { total: number; wins: number; avg: number }> = {};
    for (const r of rows ?? []) {
      const key = (r as any).lesson_label ?? "neutral";
      const entry = counts[key] ?? { total: 0, wins: 0, avg: 0 };
      entry.total += 1;
      entry.avg += Number((r as any).pnl_pct ?? 0);
      if ((r as any).outcome === "win") entry.wins += 1;
      counts[key] = entry;
    }
    return Object.entries(counts)
      .map(([lesson, v]) => ({
        lesson,
        total: v.total,
        win_rate: v.total ? Math.round((v.wins / v.total) * 100) : 0,
        avg_pnl_pct: v.total ? Number((v.avg / v.total).toFixed(2)) : 0,
      }))
      .sort((a, b) => b.total - a.total);
  },
);
