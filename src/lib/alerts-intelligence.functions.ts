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
  title: string;
  severity: string;
  message: string;
  description: string;
  action_suggestion: string;
  risk_impact: string;
  affected_symbols: string[];
  affected_sectors: string[];
  payload: any;
  triggered_at: string;
};

type AlertSeed = Omit<
  EvaluatedAlert,
  "title" | "description" | "action_suggestion" | "risk_impact" | "affected_symbols" | "affected_sectors"
> & Partial<EvaluatedAlert>;

function enrich(seed: AlertSeed): EvaluatedAlert {
  const action: Record<string, string> = {
    value_trap_warning:
      "Hindari entry baru; jika sudah memiliki posisi, perketat stop loss dan kurangi exposure secara bertahap.",
    undervalue_signal:
      "Tambahkan ke watchlist; validasi tren harga + volume + sentimen sebelum entry.",
    regime_shift:
      "Tinjau ulang exposure portfolio; turunkan ukuran posisi baru sampai regime stabil.",
    drawdown_limit:
      "Kurangi exposure, jangan tambah posisi baru, dan evaluasi posisi terlemah untuk exit.",
    concentration_risk:
      "Diversifikasi: kurangi posisi terbesar atau alokasikan ke sektor lain.",
    sector_rotation_in:
      "Prioritaskan kandidat dari sektor ini untuk watchlist; validasi price/volume sebelum entry.",
    sector_rotation_out:
      "Hindari entry agresif di sektor ini sampai rotation membaik; perketat stop pada posisi existing.",
  };
  const riskImpact: Record<string, string> = {
    value_trap_warning: "Berpotensi penurunan harga lanjutan meski tampak murah.",
    undervalue_signal: "Peluang upside jika setup teknikal mengonfirmasi.",
    regime_shift: "Volatilitas dan arah market berubah — risk model existing mungkin tidak relevan.",
    drawdown_limit: "Modal terkikis; risiko psikologis & forced exit meningkat.",
    concentration_risk: "Satu posisi gagal bisa memengaruhi seluruh portfolio.",
    sector_rotation_in: "Sektor berpotensi outperform pasar dalam jangka pendek.",
    sector_rotation_out: "Sektor berisiko underperform pasar dalam jangka pendek.",
  };
  return {
    title: seed.title ?? seed.name,
    description: seed.description ?? seed.message,
    action_suggestion: seed.action_suggestion ?? action[seed.alert_type] ?? "Tinjau ulang strategi & risk plan.",
    risk_impact: seed.risk_impact ?? riskImpact[seed.alert_type] ?? "Dampak risiko perlu evaluasi manual.",
    affected_symbols: seed.affected_symbols ?? [],
    affected_sectors: seed.affected_sectors ?? [],
    ...seed,
  } as EvaluatedAlert;
}

export const evaluateAiAlerts = createServerFn({ method: "POST" }).handler(
  async (): Promise<EvaluatedAlert[]> => {
    const triggered: EvaluatedAlert[] = [];
    const now = new Date().toISOString();

    const { data: scores } = await supabaseAdmin
      .from("ai_undervalue_scores")
      .select("symbol, classification, value_trap_risk_score, final_undervalue_score")
      .order("updated_at", { ascending: false })
      .limit(50);
    for (const s of scores ?? []) {
      const sym = (s as any).symbol;
      if ((s as any).value_trap_risk_score >= 60) {
        triggered.push(enrich({
          alert_type: "value_trap_warning",
          name: "Value Trap Warning",
          severity: "warning",
          message: `${sym}: value trap risk ${(s as any).value_trap_risk_score}.`,
          affected_symbols: [sym],
          payload: s as any,
          triggered_at: now,
        }));
      }
      if ((s as any).final_undervalue_score >= 75) {
        triggered.push(enrich({
          alert_type: "undervalue_signal",
          name: "Undervalue Signal",
          severity: "info",
          message: `${sym}: undervalue score ${(s as any).final_undervalue_score}.`,
          affected_symbols: [sym],
          payload: s as any,
          triggered_at: now,
        }));
      }
    }

    const { data: regimes } = await supabaseAdmin
      .from("market_regime_snapshots")
      .select("regime_classification, created_at")
      .order("created_at", { ascending: false })
      .limit(2);
    if (regimes && regimes.length >= 2 && (regimes[0] as any).regime_classification !== (regimes[1] as any).regime_classification) {
      triggered.push(enrich({
        alert_type: "regime_shift",
        name: "Market Regime Shift",
        severity: "warning",
        message: `Regime berubah: ${(regimes[1] as any).regime_classification} → ${(regimes[0] as any).regime_classification}.`,
        payload: { from: regimes[1], to: regimes[0] },
        triggered_at: now,
      }));
    }

    const { data: risk } = await supabaseAdmin
      .from("portfolio_risk_snapshots")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (risk) {
      if ((risk as any).current_drawdown <= -5) {
        triggered.push(enrich({
          alert_type: "drawdown_limit",
          name: "Portfolio Drawdown Limit",
          severity: "critical",
          message: `Drawdown ${(risk as any).current_drawdown}% melewati ambang -5%.`,
          payload: risk as any,
          triggered_at: now,
        }));
      }
      if ((risk as any).max_position_weight > 25) {
        triggered.push(enrich({
          alert_type: "concentration_risk",
          name: "Concentration Risk",
          severity: "warning",
          message: `Posisi terbesar ${(risk as any).max_position_weight}% melewati cap 25%.`,
          payload: risk as any,
          triggered_at: now,
        }));
      }
    }

    const { data: sectors } = await supabaseAdmin
      .from("sector_strength_snapshots")
      .select("sector, classification, relative_strength")
      .order("created_at", { ascending: false })
      .limit(40);
    const seen = new Set<string>();
    for (const row of sectors ?? []) {
      const sec = (row as any).sector;
      if (seen.has(sec)) continue;
      seen.add(sec);
      if ((row as any).classification === "rotating_in" || (row as any).classification === "leading") {
        triggered.push(enrich({
          alert_type: "sector_rotation_in",
          name: `Sector Rotating In — ${sec}`,
          severity: "info",
          message: `${sec}: RS ${(row as any).relative_strength}%.`,
          affected_sectors: [sec],
          payload: row as any,
          triggered_at: now,
        }));
      } else if ((row as any).classification === "rotating_out" || (row as any).classification === "lagging") {
        triggered.push(enrich({
          alert_type: "sector_rotation_out",
          name: `Sector Rotating Out — ${sec}`,
          severity: "warning",
          message: `${sec}: RS ${(row as any).relative_strength}%.`,
          affected_sectors: [sec],
          payload: row as any,
          triggered_at: now,
        }));
      }
    }

    return triggered;
  },
);
