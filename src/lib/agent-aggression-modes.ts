// Aggression mode presets for the AI Trade Agent (paper trading only).
// Single source of truth used by:
//   - decision engine (gates, sizing, RR floor)
//   - scanner (min score floor)
//   - cron worker (max active positions, deployment target)
//   - UI (mode selector, profit diagnostics)
//
// CRITICAL: All paths reference this table — do not hardcode mode knobs elsewhere.

export type AggressionMode =
  | "conservative" | "balanced" | "progressive" | "expert_paper" | "research_max" | "swing_max";

export type AggressionPreset = {
  mode: AggressionMode;
  label: string;
  description: string;
  targetExposurePct: number;     // cash deployment target (0..1)
  minPositionWeightPct: number;  // minimum meaningful position size
  maxPositionWeightPct: number;  // hard cap per symbol
  maxActivePositions: number;
  minBuyConfidence: number;      // floor used in decision engine
  minRR: number;                 // minimum risk/reward to BUY
  minAutonomousScore: number;    // scanner floor
  allowTechnicalWithoutFundamental: boolean;
  allowRotation: boolean;
};

export const AGGRESSION_PRESETS: Record<AggressionMode, AggressionPreset> = {
  conservative: {
    mode: "conservative", label: "Conservative",
    description: "Selektif, posisi kecil, confidence tinggi. Cocok saat market labil.",
    targetExposurePct: 0.20, minPositionWeightPct: 0.015, maxPositionWeightPct: 0.04,
    maxActivePositions: 5, minBuyConfidence: 0.75, minRR: 1.5, minAutonomousScore: 75,
    allowTechnicalWithoutFundamental: false, allowRotation: false,
  },
  balanced: {
    mode: "balanced", label: "Balanced",
    description: "Default. Cash deployment moderat, entry seimbang.",
    targetExposurePct: 0.40, minPositionWeightPct: 0.030, maxPositionWeightPct: 0.07,
    maxActivePositions: 8, minBuyConfidence: 0.65, minRR: 1.8, minAutonomousScore: 70,
    allowTechnicalWithoutFundamental: false, allowRotation: true,
  },
  progressive: {
    mode: "progressive", label: "Progressive",
    description: "Lebih aktif, posisi menengah, rotasi diizinkan.",
    targetExposurePct: 0.60, minPositionWeightPct: 0.050, maxPositionWeightPct: 0.10,
    maxActivePositions: 12, minBuyConfidence: 0.55, minRR: 2.0, minAutonomousScore: 60,
    allowTechnicalWithoutFundamental: true, allowRotation: true,
  },
  expert_paper: {
    mode: "expert_paper", label: "Expert Paper",
    description: "Cash deployment tinggi, terima setup teknikal kuat tanpa fundamental — paper only.",
    targetExposurePct: 0.75, minPositionWeightPct: 0.060, maxPositionWeightPct: 0.12,
    maxActivePositions: 15, minBuyConfidence: 0.50, minRR: 2.2, minAutonomousScore: 55,
    allowTechnicalWithoutFundamental: true, allowRotation: true,
  },
  research_max: {
    mode: "research_max", label: "Research Max",
    description: "Eksplorasi maksimum untuk data training — paper only, jangan untuk uang nyata.",
    targetExposurePct: 0.85, minPositionWeightPct: 0.070, maxPositionWeightPct: 0.15,
    maxActivePositions: 20, minBuyConfidence: 0.45, minRR: 2.5, minAutonomousScore: 50,
    allowTechnicalWithoutFundamental: true, allowRotation: true,
  },
};

export function getPreset(mode: string | null | undefined): AggressionPreset {
  const m = String(mode ?? "balanced").toLowerCase();
  return (AGGRESSION_PRESETS as any)[m] ?? AGGRESSION_PRESETS.balanced;
}

/** Map aggression mode -> legacy autonomous_risk_mode for back-compat (scanner/engine). */
export function toLegacyRiskMode(mode: AggressionMode): "conservative" | "balanced" | "progressive" | "expert_research" {
  if (mode === "conservative") return "conservative";
  if (mode === "progressive") return "progressive";
  if (mode === "expert_paper" || mode === "research_max") return "expert_research";
  return "balanced";
}

/** Resolve effective knob from agent row, falling back to preset. */
export function resolveAgentKnobs(agent: Record<string, any>) {
  const preset = getPreset(agent?.aggression_mode);
  return {
    preset,
    targetExposurePct: Number(agent?.target_exposure_pct ?? preset.targetExposurePct),
    minPositionWeightPct: Number(agent?.min_position_weight_pct ?? preset.minPositionWeightPct),
    maxPositionWeightPct: Math.max(
      Number(agent?.max_position_per_symbol ?? 0),
      preset.maxPositionWeightPct,
    ) || preset.maxPositionWeightPct,
    maxActivePositions: Math.max(
      Number(agent?.max_active_positions ?? 0),
      preset.maxActivePositions,
    ) || preset.maxActivePositions,
    minBuyConfidence: Math.min(
      Number(agent?.min_confidence_to_trade ?? 1),
      preset.minBuyConfidence,
    ),
    minRR: preset.minRR,
    minAutonomousScore: Math.min(
      Number(agent?.min_autonomous_score ?? 100),
      preset.minAutonomousScore,
    ),
  };
}
