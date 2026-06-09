/**
 * Learning calibration engine.
 * Server-only. Reads user-scoped memory tables and returns adjustments
 * to confidence / allocation / cooldown for the AI decision engine.
 *
 * Hard safety guards are NOT enforced here — this only nudges scores.
 * The decision engine still requires SL/TP/RR/lot>0 etc.
 */

export type LearningAdjustments = {
  symbolAdj: number;
  strategyAdj: number;
  sectorAdj: number;
  regimeAdj: number;
  finalConfidenceAdj: number;
  allocationMultiplier: number;
  cooldownActive: boolean;
  cooldownUntil: string | null;
  strategyPaused: boolean;
  cautionFlags: string[];
  sampleStrength: "none" | "low" | "moderate" | "strong";
  notes: string[];
};

export function neutralAdjustments(): LearningAdjustments {
  return {
    symbolAdj: 0,
    strategyAdj: 0,
    sectorAdj: 0,
    regimeAdj: 0,
    finalConfidenceAdj: 0,
    allocationMultiplier: 1,
    cooldownActive: false,
    cooldownUntil: null,
    strategyPaused: false,
    cautionFlags: [],
    sampleStrength: "none",
    notes: [],
  };
}

type Args = {
  userId: string;
  symbol: string;
  strategyMode?: string | null;
  agentMode?: string | null;
  sector?: string | null;
  marketRegime?: string | null;
};

export async function calculateLearningAdjustments(args: Args): Promise<LearningAdjustments> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const out = neutralAdjustments();
  const now = Date.now();

  // 1) Symbol memory
  const { data: sym } = await supabaseAdmin
    .from("trade_memory_by_symbol")
    .select("*")
    .eq("user_id", args.userId)
    .eq("symbol", args.symbol)
    .maybeSingle();

  if (sym) {
    if (sym.cooldown_until && new Date(sym.cooldown_until).getTime() > now) {
      out.cooldownActive = true;
      out.cooldownUntil = sym.cooldown_until;
      out.cautionFlags.push("symbol_cooldown");
    }
    const n = sym.sample_count ?? 0;
    if (n >= 5) {
      out.sampleStrength = n >= 20 ? "strong" : n >= 10 ? "moderate" : "low";
      const wr = Number(sym.win_rate ?? 0);
      const pf = Number(sym.profit_factor ?? 0);
      if (wr < 0.3) {
        out.symbolAdj -= 12;
        out.cautionFlags.push("symbol_low_winrate");
      } else if (wr > 0.6 && pf >= 1.5) {
        out.symbolAdj += 5;
      }
      if (pf > 0 && pf < 0.7) {
        out.symbolAdj -= 8;
        out.cautionFlags.push("symbol_low_pf");
      }
      out.symbolAdj += Number(sym.confidence_adjustment ?? 0);
      out.notes.push(`Memori ${args.symbol}: ${n} trade, WR ${(wr * 100).toFixed(0)}%, PF ${pf.toFixed(2)}`);
    } else if (n > 0) {
      out.sampleStrength = "low";
      out.notes.push(`Sampel ${args.symbol} masih sedikit (${n} trade) — pakai starter sizing.`);
    }
  }

  // 2) Strategy memory
  if (args.strategyMode) {
    const { data: strat } = await supabaseAdmin
      .from("strategy_performance_memory")
      .select("*")
      .eq("user_id", args.userId)
      .eq("strategy_mode", args.strategyMode)
      .maybeSingle();
    if (strat) {
      if (strat.is_paused) {
        out.strategyPaused = true;
        out.cautionFlags.push("strategy_paused");
      }
      if (strat.cooldown_until && new Date(strat.cooldown_until).getTime() > now) {
        out.cooldownActive = true;
        out.cooldownUntil = strat.cooldown_until;
        out.cautionFlags.push("strategy_cooldown");
      }
      const n = strat.sample_count ?? 0;
      if (n >= 10) {
        const pf = Number(strat.profit_factor ?? 0);
        if (pf > 0 && pf < 0.7) {
          out.allocationMultiplier = Math.min(out.allocationMultiplier, 0.5);
          out.strategyAdj -= 6;
          out.cautionFlags.push("strategy_low_pf");
        } else if (pf >= 1.5) {
          out.strategyAdj += 4;
        }
      }
      out.strategyAdj += Number(strat.confidence_adjustment ?? 0);
      out.allocationMultiplier *= Number(strat.allocation_multiplier ?? 1);
    }
  }

  // 3) Sector memory
  if (args.sector) {
    const { data: sec } = await supabaseAdmin
      .from("sector_performance_memory")
      .select("*")
      .eq("user_id", args.userId)
      .eq("sector", args.sector)
      .maybeSingle();
    if (sec && (sec.sample_count ?? 0) >= 5) {
      const wr = Number(sec.win_rate ?? 0);
      if (wr < 0.35) {
        out.sectorAdj -= 5;
        out.cautionFlags.push("sector_weak");
      } else if (wr > 0.55) {
        out.sectorAdj += 3;
      }
      out.sectorAdj += Number(sec.sector_confidence_adjustment ?? 0);
    }
  }

  // 4) Regime memory
  if (args.marketRegime && args.strategyMode) {
    const { data: reg } = await supabaseAdmin
      .from("market_regime_performance_memory")
      .select("*")
      .eq("user_id", args.userId)
      .eq("market_regime", args.marketRegime)
      .eq("strategy_mode", args.strategyMode)
      .maybeSingle();
    if (reg && (reg.sample_count ?? 0) >= 5) {
      out.regimeAdj += Number(reg.confidence_adjustment ?? 0);
      out.allocationMultiplier *= Number(reg.allocation_multiplier ?? 1);
    }
    if (args.marketRegime === "high_volatility" || args.marketRegime === "downtrend") {
      out.allocationMultiplier = Math.min(out.allocationMultiplier, 0.7);
      out.cautionFlags.push("regime_unfavorable");
    }
  }

  // Low sample → reduce sizing but never below floor
  if (out.sampleStrength === "none" || out.sampleStrength === "low") {
    out.allocationMultiplier = Math.min(out.allocationMultiplier, 0.5);
  }
  out.allocationMultiplier = Math.max(0.1, Math.min(1.5, out.allocationMultiplier));

  out.finalConfidenceAdj = Math.max(
    -25,
    Math.min(15, out.symbolAdj + out.strategyAdj + out.sectorAdj + out.regimeAdj),
  );
  return out;
}
