// Server function wrapper exposing momentum candidates to the UI.
// Read-only — no DB writes. Used by the "AI Momentum Hunter" panel.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchMarketMovers, computeMomentum, type MomentumClassification } from "./momentum-hunter.server";
import { getQuotes, type Quote } from "./market.functions";

export type MomentumPanelRow = {
  rank: number;
  symbol: string;
  todayChangePercent: number;
  relativeVolume: number;
  momentumScore: number;
  liquidityScore: number;
  catalystScore: number;
  riskPenalty: number;
  classification: MomentumClassification;
  reason: string;
  catalystSummary: string | null;
  warnings: string[];
  /** Suggested action for the panel — agent may still block at execution time. */
  aiAction: "MOMENTUM BUY" | "EARLY WATCH" | "MOMENTUM WATCH" | "EXTENDED RISK" | "BLOCKED RISK" | "NO TRADE";
};

function pickAction(c: MomentumClassification, momentumScore: number, riskPenalty: number, change: number): MomentumPanelRow["aiAction"] {
  if (c === "failed_momentum") return "BLOCKED RISK";
  if (c === "extended_momentum_risk") return "EXTENDED RISK";
  if (c === "strong_momentum_candidate" && momentumScore >= 75 && riskPenalty < 30 && change >= 5) return "MOMENTUM BUY";
  if (c === "early_momentum_candidate") return "EARLY WATCH";
  if (c === "watch_only") return "MOMENTUM WATCH";
  return "NO TRADE";
}

export const scanMomentumCandidates = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      topN: z.number().int().min(1).max(50).optional().default(20),
      includeSymbols: z.array(z.string().min(1).max(20)).optional().default([]),
    }).parse(d ?? {}),
  )
  .handler(async ({ data }): Promise<{ rows: MomentumPanelRow[]; generatedAt: string }> => {
    const scored = await fetchMarketMovers(data.topN);

    // Merge any user-requested extra symbols (e.g., active positions).
    if (data.includeSymbols.length > 0) {
      const known = new Set(scored.map(s => s.symbol));
      const extras = data.includeSymbols
        .map(s => s.toUpperCase())
        .filter(s => !known.has(s));
      if (extras.length > 0) {
        try {
          const quotes = await getQuotes({ data: { symbols: extras } }) as Quote[];
          for (const q of quotes) {
            if (q?.price) scored.push(computeMomentum(q));
          }
        } catch { /* tolerate */ }
      }
    }

    const rows: MomentumPanelRow[] = scored.map((s, i) => ({
      rank: i + 1,
      symbol: s.symbol,
      todayChangePercent: s.todayChangePercent,
      relativeVolume: s.relativeVolume,
      momentumScore: s.momentumScore,
      liquidityScore: s.liquidityScore,
      catalystScore: s.catalystScore,
      riskPenalty: s.riskPenalty,
      classification: s.classification,
      reason: s.reason,
      catalystSummary: s.catalystSummary,
      warnings: s.warnings,
      aiAction: pickAction(s.classification, s.momentumScore, s.riskPenalty, Math.abs(s.todayChangePercent)),
    }));

    return { rows, generatedAt: new Date().toISOString() };
  });
