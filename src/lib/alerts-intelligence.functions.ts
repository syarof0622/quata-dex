// Phase D: AI Alert Intelligence. Lists alert definitions + evaluates a subset
// of multi-factor alert rules against the latest snapshots.
import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const listAlertDefinitions = createServerFn({ method: "GET" }).handler(
  async () => {
    const { data } = await supabaseAdmin
      .from("ai_alerts_definitions")
      .select("*")
      .order("category", { ascending: true })
      .order("name", { ascending: true });
    return data ?? [];
  },
);

type EvaluatedAlert = {
  alert_type: string;
  name: string;
  severity: string;
  message: string;
  payload: Record<string, unknown>;
  triggered_at: string;
};

export const evaluateAiAlerts = createServerFn({ method: "POST" }).handler(
  async (): Promise<EvaluatedAlert[]> => {
    const triggered: EvaluatedAlert[] = [];
    const now = new Date().toISOString();

    // Value trap / undervalue from ai_undervalue_scores
    const { data: scores } = await supabaseAdmin
      .from("ai_undervalue_scores")
      .select("symbol, classification, value_trap_risk_score, final_undervalue_score")
      .order("updated_at", { ascending: false })
      .limit(50);
    for (const s of scores ?? []) {
      if ((s as any).value_trap_risk_score >= 60) {
        triggered.push({
          alert_type: "value_trap_warning",
          name: "Value Trap Warning",
          severity: "warning",
          message: `${(s as any).symbol}: value trap risk ${(s as any).value_trap_risk_score}.`,
          payload: s as any,
          triggered_at: now,
        });
      }
      if ((s as any).final_undervalue_score >= 75) {
        triggered.push({
          alert_type: "undervalue_signal",
          name: "Undervalue Signal",
          severity: "info",
          message: `${(s as any).symbol}: undervalue score ${(s as any).final_undervalue_score}.`,
          payload: s as any,
          triggered_at: now,
        });
      }
    }

    // Regime shift: compare 2 most recent snapshots
    const { data: regimes } = await supabaseAdmin
      .from("market_regime_snapshots")
      .select("regime_classification, created_at")
      .order("created_at", { ascending: false })
      .limit(2);
    if (regimes && regimes.length >= 2 && (regimes[0] as any).regime_classification !== (regimes[1] as any).regime_classification) {
      triggered.push({
        alert_type: "regime_shift",
        name: "Market Regime Shift",
        severity: "warning",
        message: `Regime berubah: ${(regimes[1] as any).regime_classification} -> ${(regimes[0] as any).regime_classification}.`,
        payload: { from: regimes[1], to: regimes[0] },
        triggered_at: now,
      });
    }

    // Portfolio drawdown / concentration
    const { data: risk } = await supabaseAdmin
      .from("portfolio_risk_snapshots")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (risk) {
      if ((risk as any).current_drawdown <= -5) {
        triggered.push({
          alert_type: "drawdown_limit",
          name: "Portfolio Drawdown Limit",
          severity: "critical",
          message: `Drawdown ${(risk as any).current_drawdown}% melewati ambang -5%.`,
          payload: risk as any,
          triggered_at: now,
        });
      }
      if ((risk as any).max_position_weight > 25) {
        triggered.push({
          alert_type: "concentration_risk",
          name: "Concentration Risk",
          severity: "warning",
          message: `Posisi terbesar ${(risk as any).max_position_weight}% melewati cap 25%.`,
          payload: risk as any,
          triggered_at: now,
        });
      }
    }

    // Sector rotation
    const { data: sectors } = await supabaseAdmin
      .from("sector_strength_snapshots")
      .select("sector, classification, relative_strength")
      .order("created_at", { ascending: false })
      .limit(20);
    const seen = new Set<string>();
    for (const row of sectors ?? []) {
      if (seen.has((row as any).sector)) continue;
      seen.add((row as any).sector);
      if ((row as any).classification === "rotating_in") {
        triggered.push({
          alert_type: "sector_rotation_in",
          name: "Sector Rotating In",
          severity: "info",
          message: `${(row as any).sector}: RS ${(row as any).relative_strength}%.`,
          payload: row as any,
          triggered_at: now,
        });
      } else if ((row as any).classification === "rotating_out") {
        triggered.push({
          alert_type: "sector_rotation_out",
          name: "Sector Rotating Out",
          severity: "warning",
          message: `${(row as any).sector}: RS ${(row as any).relative_strength}%.`,
          payload: row as any,
          triggered_at: now,
        });
      }
    }

    return triggered;
  },
);
