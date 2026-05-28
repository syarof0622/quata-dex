// Portfolio Intelligence engine — Update 15.
// Pure server module. Reads from analytics + market regime + fundamental /
// disclosure signals, computes a 10-component Portfolio Health Score,
// position attribution & sector roll-ups, regime-aware cash drag, and
// AI-actionable insights. Persists snapshots into the three new tables.
//
// Read-only against trading state: never writes to paper_orders /
// paper_positions / paper_accounts. Paper-trading-only by construction.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getPortfolioAnalytics } from "./analytics.functions";

const USER_ID = "00000000-0000-0000-0000-000000000001";

export type RiskLevel = "Healthy" | "Stable" | "Caution" | "Risky" | "Critical";

export type HealthBreakdown = {
  cashBuffer: number;          // 0..10
  drawdown: number;            // 0..10
  positionConcentration: number;
  sectorConcentration: number;
  unrealizedPnl: number;
  fundamentalConfidence: number;
  disclosureRisk: number;
  valueTrapExposure: number;
  strategyAlignment: number;
  regimeCompatibility: number;
};

export type PortfolioHealth = {
  portfolioHealthScore: number;       // 0..100
  riskLevel: RiskLevel;
  summary: string;
  positives: string[];
  warnings: string[];
  criticalIssues: string[];
  breakdown: HealthBreakdown;
  marketRegime: string | null;
  cashRatio: number;
  investedRatio: number;
  exposureScore: number;             // derived 0..100
  concentrationScore: number;        // 0..100 — higher = better diversified
  diversificationScore: number;
  cashDragScore: number;             // 0..100 — higher = less drag
  sectorRiskScore: number;
  valueTrapExposurePct: number;
  insufficientFundamentalExposurePct: number;
  disclosureRiskExposurePct: number;
};

function classify(score: number): RiskLevel {
  if (score >= 80) return "Healthy";
  if (score >= 65) return "Stable";
  if (score >= 45) return "Caution";
  if (score >= 25) return "Risky";
  return "Critical";
}

async function getMarketRegime(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("market_regime_snapshots")
    .select("regime_classification, regime_trend")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as any)?.regime_classification ?? null;
}

async function getFundamentalContext(symbols: string[]) {
  if (!symbols.length) return new Map<string, any>();
  const [{ data: signals }, { data: quality }] = await Promise.all([
    supabaseAdmin.from("fundamental_signal_snapshots")
      .select("symbol, final_fundamental_label, value_trap_level, confidence")
      .in("symbol", symbols),
    supabaseAdmin.from("fundamental_quality_scores")
      .select("symbol, status, confidence_score")
      .in("symbol", symbols),
  ]);
  const map = new Map<string, any>();
  for (const s of (signals ?? []) as any[]) {
    map.set(s.symbol, {
      label: s.final_fundamental_label,
      valueTrapLevel: s.value_trap_level,
      confidence: Number(s.confidence ?? 0),
    });
  }
  for (const q of (quality ?? []) as any[]) {
    const prev = map.get(q.symbol) ?? {};
    map.set(q.symbol, { ...prev, qualityStatus: q.status, qualityConfidence: Number(q.confidence_score ?? 0) });
  }
  return map;
}

async function getDisclosureRiskMap(symbols: string[]) {
  if (!symbols.length) return new Map<string, string[]>();
  const since = new Date(Date.now() - 30 * 86400 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from("corporate_actions")
    .select("symbol, risk_flags, sentiment, impact_score")
    .in("symbol", symbols)
    .gte("created_at", since);
  const map = new Map<string, string[]>();
  for (const r of (data ?? []) as any[]) {
    const flags = (r.risk_flags ?? []) as string[];
    if (!flags.length && r.sentiment === "negative" && Number(r.impact_score ?? 0) >= 60) {
      flags.push("negative_high_impact_disclosure");
    }
    if (flags.length) {
      const prev = map.get(r.symbol) ?? [];
      map.set(r.symbol, [...new Set([...prev, ...flags])]);
    }
  }
  return map;
}

export async function calculatePortfolioHealth(): Promise<{ health: PortfolioHealth; accountId: string | null; analytics: any }> {
  const analytics: any = await getPortfolioAnalytics();
  const { data: account } = await supabaseAdmin
    .from("paper_accounts")
    .select("id, cash, equity, initial_balance")
    .eq("user_id", USER_ID)
    .maybeSingle();
  const accountId = account?.id ?? null;

  const equity = Number(analytics?.equity ?? account?.equity ?? 0);
  const cash = Number(analytics?.cash ?? account?.cash ?? 0);
  const holdingsValue = Number(analytics?.totalValue ?? 0);
  const cashRatio = equity > 0 ? (cash / equity) * 100 : 100;
  const investedRatio = 100 - cashRatio;
  const drawdown = Number(analytics?.drawdown ?? 0);
  const maxPositionWeight = Number(analytics?.maxPositionWeight ?? analytics?.concentration ?? 0);
  const largestSectorPct = Number(analytics?.largestSectorPct ?? 0);
  const unrealizedPnl = Number(analytics?.unrealized ?? 0);
  const positions = Array.isArray(analytics?.positions) ? analytics.positions : [];
  const pnlPct = Number(analytics?.pnlPct ?? 0);
  const regime = await getMarketRegime();

  const symbols = positions.map((p: any) => p.symbol as string);
  const [fund, disclosureMap] = await Promise.all([
    getFundamentalContext(symbols),
    getDisclosureRiskMap(symbols),
  ]);

  let valueTrapExposureValue = 0;
  let insufficientFundamentalValue = 0;
  let disclosureRiskValue = 0;
  for (const p of positions) {
    const f = fund.get(p.symbol);
    const v = Number(p.value ?? 0);
    if (f?.valueTrapLevel === "high" || f?.valueTrapLevel === "medium") valueTrapExposureValue += v;
    if (!f || f.qualityStatus === "insufficient" || (f.confidence ?? 0) < 50) insufficientFundamentalValue += v;
    if ((disclosureMap.get(p.symbol) ?? []).length > 0) disclosureRiskValue += v;
  }
  const valueTrapExposurePct = equity > 0 ? (valueTrapExposureValue / equity) * 100 : 0;
  const insufficientFundamentalExposurePct = equity > 0 ? (insufficientFundamentalValue / equity) * 100 : 0;
  const disclosureRiskExposurePct = equity > 0 ? (disclosureRiskValue / equity) * 100 : 0;

  const isBullish = regime === "bullish" || regime === "risk_on";
  const isRiskOff = regime === "risk_off" || regime === "bearish";

  // ---- 10-component scoring (each 0..10) ----
  const positives: string[] = [];
  const warnings: string[] = [];
  const critical: string[] = [];

  // 1) Cash buffer — regime aware
  let cashBuffer: number;
  if (positions.length === 0) {
    cashBuffer = 7; // neutral when no positions
  } else if (cashRatio < 5) { cashBuffer = 2; critical.push("Cash buffer < 5% — exit liquidity sangat tipis."); }
  else if (cashRatio < 10) { cashBuffer = 4; warnings.push("Cash buffer < 10% — risiko likuiditas naik."); }
  else if (cashRatio < 25) { cashBuffer = 8; positives.push(`Cash buffer ${cashRatio.toFixed(1)}% sehat.`); }
  else if (cashRatio < 60) { cashBuffer = 9; positives.push(`Cash ${cashRatio.toFixed(1)}% memberi ruang re-entry.`); }
  else {
    if (isRiskOff) { cashBuffer = 10; positives.push(`Cash tinggi ${cashRatio.toFixed(1)}% melindungi saat regime risk-off.`); }
    else if (isBullish) { cashBuffer = 5; warnings.push(`Cash ${cashRatio.toFixed(1)}% — potensi cash drag saat regime bullish.`); }
    else { cashBuffer = 7; }
  }

  // 2) Drawdown
  let ddScore: number;
  if (drawdown >= -2) ddScore = 10;
  else if (drawdown >= -5) ddScore = 8;
  else if (drawdown >= -8) { ddScore = 5; warnings.push(`Drawdown ${drawdown.toFixed(2)}%.`); }
  else if (drawdown >= -12) { ddScore = 3; warnings.push(`Drawdown ${drawdown.toFixed(2)}% — tinjau ulang exit plan.`); }
  else { ddScore = 1; critical.push(`Drawdown ${drawdown.toFixed(2)}% — tekanan signifikan.`); }

  // 3) Position concentration
  let concScore: number;
  if (positions.length === 0) concScore = 7;
  else if (maxPositionWeight > 50) { concScore = 2; critical.push(`Posisi terbesar ${maxPositionWeight.toFixed(1)}% — konsentrasi ekstrim.`); }
  else if (maxPositionWeight > 35) { concScore = 4; warnings.push(`Posisi terbesar ${maxPositionWeight.toFixed(1)}%.`); }
  else if (maxPositionWeight > 25) { concScore = 6; }
  else if (maxPositionWeight > 15) { concScore = 8; }
  else { concScore = 10; positives.push("Distribusi posisi terdiversifikasi."); }

  // 4) Sector concentration
  let sectorConc: number;
  if (positions.length === 0) sectorConc = 7;
  else if (largestSectorPct > 60) { sectorConc = 2; critical.push(`Sektor terbesar ${largestSectorPct.toFixed(1)}%.`); }
  else if (largestSectorPct > 40) { sectorConc = 5; warnings.push(`Sektor terbesar ${largestSectorPct.toFixed(1)}% — risiko sektoral.`); }
  else if (largestSectorPct > 25) sectorConc = 7;
  else sectorConc = 10;

  // 5) Unrealized P/L
  let pnlScore: number;
  if (positions.length === 0) pnlScore = 7;
  else if (pnlPct >= 10) { pnlScore = 10; positives.push(`Total return +${pnlPct.toFixed(1)}%.`); }
  else if (pnlPct >= 2) pnlScore = 8;
  else if (pnlPct >= -2) pnlScore = 6;
  else if (pnlPct >= -8) { pnlScore = 4; warnings.push(`Return ${pnlPct.toFixed(1)}% — performa di bawah baseline.`); }
  else { pnlScore = 2; critical.push(`Return ${pnlPct.toFixed(1)}% — review tesis dan exit.`); }

  // 6) Fundamental confidence
  let fundScore: number;
  if (positions.length === 0) fundScore = 7;
  else if (insufficientFundamentalExposurePct > 70) { fundScore = 3; warnings.push(`${insufficientFundamentalExposurePct.toFixed(0)}% portfolio tanpa data fundamental cukup.`); }
  else if (insufficientFundamentalExposurePct > 40) fundScore = 5;
  else if (insufficientFundamentalExposurePct > 20) fundScore = 7;
  else { fundScore = 10; positives.push("Eksposur dengan data fundamental memadai dominan."); }

  // 7) Disclosure risk
  let discScore: number;
  if (positions.length === 0) discScore = 8;
  else if (disclosureRiskExposurePct > 30) { discScore = 2; critical.push(`${disclosureRiskExposurePct.toFixed(0)}% portfolio terdampak disclosure berisiko.`); }
  else if (disclosureRiskExposurePct > 10) { discScore = 5; warnings.push(`Eksposur disclosure berisiko ${disclosureRiskExposurePct.toFixed(0)}%.`); }
  else discScore = 10;

  // 8) Value trap exposure
  let trapScore: number;
  if (positions.length === 0) trapScore = 8;
  else if (valueTrapExposurePct > 25) { trapScore = 3; warnings.push(`Eksposur value-trap ${valueTrapExposurePct.toFixed(0)}%.`); }
  else if (valueTrapExposurePct > 10) trapScore = 6;
  else trapScore = 10;

  // 9) Strategy alignment — proxy: warnings count from analytics
  const warnCount = Array.isArray(analytics?.warnings) ? analytics.warnings.length : 0;
  const strategyAlign = warnCount === 0 ? 9 : warnCount <= 1 ? 7 : warnCount <= 3 ? 5 : 3;

  // 10) Regime compatibility
  let regimeFit: number;
  if (!regime || regime === "unknown" || regime === "neutral") regimeFit = 7;
  else if (isRiskOff && cashRatio >= 40) { regimeFit = 10; positives.push("Defensive posture cocok untuk regime risk-off."); }
  else if (isRiskOff && investedRatio > 70) { regimeFit = 4; warnings.push("Eksposur tinggi saat regime risk-off."); }
  else if (isBullish && cashRatio > 60) { regimeFit = 5; warnings.push("Cash drag potensial saat regime bullish."); }
  else if (isBullish && investedRatio >= 40) regimeFit = 9;
  else regimeFit = 7;

  const breakdown: HealthBreakdown = {
    cashBuffer, drawdown: ddScore, positionConcentration: concScore,
    sectorConcentration: sectorConc, unrealizedPnl: pnlScore,
    fundamentalConfidence: fundScore, disclosureRisk: discScore,
    valueTrapExposure: trapScore, strategyAlignment: strategyAlign,
    regimeCompatibility: regimeFit,
  };
  const portfolioHealthScore = Math.round(
    Object.values(breakdown).reduce((s, v) => s + v, 0) // 0..100
  );
  const riskLevel = classify(portfolioHealthScore);

  const summary = positions.length === 0
    ? `Belum ada posisi terbuka. Cash ratio 100% — netral untuk regime ${regime ?? "unknown"}.`
    : `Health ${portfolioHealthScore}/100 (${riskLevel}). Cash ${cashRatio.toFixed(1)}%, invested ${investedRatio.toFixed(1)}%, posisi terbesar ${maxPositionWeight.toFixed(1)}%, sektor terbesar ${largestSectorPct.toFixed(1)}%, drawdown ${drawdown.toFixed(2)}%, return ${pnlPct.toFixed(2)}%.`;

  const health: PortfolioHealth = {
    portfolioHealthScore, riskLevel, summary,
    positives, warnings, criticalIssues: critical, breakdown,
    marketRegime: regime, cashRatio, investedRatio,
    exposureScore: Math.round(investedRatio),
    concentrationScore: Math.round(concScore * 10),
    diversificationScore: Math.round(((concScore + sectorConc) / 2) * 10),
    cashDragScore: Math.round(cashBuffer * 10),
    sectorRiskScore: Math.round(sectorConc * 10),
    valueTrapExposurePct, insufficientFundamentalExposurePct, disclosureRiskExposurePct,
  };

  return { health, accountId, analytics };
}

export type PortfolioInsights = {
  summary: string;
  healthScore: number;
  riskLevel: RiskLevel;
  topRisks: string[];
  topOpportunities: string[];
  suggestedActions: string[];
  monitorList: { symbol: string; reason: string }[];
  whatIfHighlights: string[];
};

export async function generatePortfolioInsights(): Promise<PortfolioInsights> {
  const { health, analytics } = await calculatePortfolioHealth();
  const attribution = analytics?.attribution;
  const scenarios = analytics?.scenarios ?? [];
  const cashDrag = analytics?.cashDrag;

  const topRisks = [...health.criticalIssues, ...health.warnings].slice(0, 5);
  const topOpportunities: string[] = [...health.positives];
  if (cashDrag?.note) topOpportunities.push(cashDrag.note);

  const suggestedActions: string[] = [];
  if (health.cashRatio > 60 && health.marketRegime === "bullish") {
    suggestedActions.push("Pertimbangkan deploy sebagian cash bertahap pada kandidat watchlist top-score.");
  }
  if (health.criticalIssues.some(s => /konsentrasi/i.test(s))) {
    suggestedActions.push("Pertimbangkan reduce 30-50% pada posisi terbesar untuk menurunkan concentration risk.");
  }
  if (health.disclosureRiskExposurePct > 10) {
    suggestedActions.push("Audit posisi dengan disclosure flag negatif sebelum menambah eksposur.");
  }
  if (health.valueTrapExposurePct > 15) {
    suggestedActions.push("Tinjau ulang posisi dengan value-trap risk tinggi.");
  }
  if (suggestedActions.length === 0) {
    suggestedActions.push("Tidak ada aksi mendesak — pantau exit plan dan jadwal review berkala.");
  }

  const monitorList: { symbol: string; reason: string }[] = [];
  const positions = Array.isArray(attribution?.positions) ? attribution.positions : [];
  for (const p of positions) {
    if (p.unrealizedPnl < 0 && Math.abs(p.contributionToReturn) > 1) {
      monitorList.push({ symbol: p.symbol, reason: `Loss driver: kontribusi ${p.contributionToReturn.toFixed(2)}%.` });
    } else if (p.weight > 30) {
      monitorList.push({ symbol: p.symbol, reason: `Weight ${p.weight.toFixed(1)}% — concentration risk.` });
    }
  }

  const whatIfHighlights: string[] = [];
  for (const s of scenarios) {
    whatIfHighlights.push(
      `${s.scenario}: equity ${s.estimatedPortfolioChangePct.toFixed(2)}% (confidence ${s.confidence})${s.worstContributor ? `, worst: ${s.worstContributor.symbol}` : ""}.`,
    );
  }

  return {
    summary: health.summary,
    healthScore: health.portfolioHealthScore,
    riskLevel: health.riskLevel,
    topRisks,
    topOpportunities,
    suggestedActions,
    monitorList: monitorList.slice(0, 8),
    whatIfHighlights,
  };
}

export async function snapshotPortfolioIntelligence(): Promise<{ snapshotId: string | null; positionsSnapshotted: number }> {
  const { health, accountId, analytics } = await calculatePortfolioHealth();
  if (!accountId) return { snapshotId: null, positionsSnapshotted: 0 };

  const equity = Number(analytics?.equity ?? 0);
  const cash = Number(analytics?.cash ?? 0);
  const holdingsValue = Number(analytics?.totalValue ?? 0);

  const { data: snap, error } = await supabaseAdmin
    .from("portfolio_intelligence_snapshots")
    .insert({
      account_id: accountId,
      user_id: USER_ID,
      equity, cash, holdings_value: holdingsValue,
      cash_ratio: health.cashRatio,
      invested_ratio: health.investedRatio,
      unrealized_pnl: Number(analytics?.unrealized ?? 0),
      realized_pnl: Number(analytics?.realized ?? 0),
      total_return_pct: Number(analytics?.pnlPct ?? 0),
      daily_pnl: Number(analytics?.dailyPnl ?? 0),
      max_drawdown: Number(analytics?.drawdown ?? 0),
      portfolio_health_score: health.portfolioHealthScore,
      risk_level: health.riskLevel,
      concentration_score: health.concentrationScore,
      diversification_score: health.diversificationScore,
      cash_drag_score: health.cashDragScore,
      exposure_score: health.exposureScore,
      sector_risk_score: health.sectorRiskScore,
      value_trap_exposure_pct: health.valueTrapExposurePct,
      insufficient_fundamental_exposure_pct: health.insufficientFundamentalExposurePct,
      disclosure_risk_exposure_pct: health.disclosureRiskExposurePct,
      market_regime: health.marketRegime,
      positives: health.positives,
      warnings: health.warnings,
      critical_issues: health.criticalIssues,
      summary: health.summary,
    })
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[portfolio-intel] snapshot insert failed", error);
    return { snapshotId: null, positionsSnapshotted: 0 };
  }

  const attribPositions = Array.isArray(analytics?.attribution?.positions) ? analytics.attribution.positions : [];
  if (attribPositions.length) {
    const rows = attribPositions.map((p: any) => ({
      account_id: accountId,
      user_id: USER_ID,
      symbol: p.symbol,
      sector: p.sector ?? null,
      quantity: Number(p.qty ?? 0),
      avg_entry: Number(p.avgEntry ?? 0),
      last_price: Number(p.lastPrice ?? 0),
      market_value: Number(p.marketValue ?? 0),
      position_weight_pct: Number(p.weight ?? 0),
      unrealized_pnl: Number(p.unrealizedPnl ?? 0),
      unrealized_pnl_pct: Number(p.unrealizedPnlPct ?? 0),
      contribution_to_return: Number(p.contributionToReturn ?? 0),
      contribution_to_risk: Number(p.contributionToRisk ?? 0),
      volatility_estimate: p.volatility ?? null,
      beta_estimate: p.beta ?? null,
      beta_source: p.betaSource ?? null,
      risk_level: "moderate",
    }));
    await supabaseAdmin.from("position_attribution_snapshots").insert(rows);
  }

  return { snapshotId: snap?.id ?? null, positionsSnapshotted: attribPositions.length };
}
