// Portfolio scenario engine — Update 15.
// READ-ONLY simulations. Never writes to paper_orders / paper_positions /
// paper_accounts. Every scenario run is persisted into
// portfolio_scenario_results so the UI + AI Analyst can cite history.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { currentUserId } from "@/lib/current-user.server";
import { getPortfolioAnalytics, simulatePortfolioWhatIf } from "./analytics.functions";
import { getQuotes } from "./market.functions";
import { sectorOf } from "./sectors";
import { SECTOR_BETA_PRIOR } from "./portfolio-attribution";
import { calculatePortfolioHealth } from "./portfolio-intelligence.server";


export type ScenarioType =
  | "IHSG_DOWN_2" | "IHSG_DOWN_5" | "IHSG_DOWN_10" | "IHSG_UP_2"
  | "SECTOR_DROP" | "CLOSE_POSITION" | "REDUCE_POSITION"
  | "ADD_POSITION" | "DEPLOY_CASH" | "CASH_TO_50" | "CUSTOM_PRICE_MOVE";

export type ScenarioInput =
  | { type: "IHSG_DOWN_2" | "IHSG_DOWN_5" | "IHSG_DOWN_10" | "IHSG_UP_2" }
  | { type: "SECTOR_DROP"; sector: string; movePct: number }
  | { type: "CLOSE_POSITION"; symbol: string }
  | { type: "REDUCE_POSITION"; symbol: string; reducePct: number }
  | { type: "ADD_POSITION"; symbol: string; amount: number }
  | { type: "DEPLOY_CASH"; deployPct: number; targetSymbols?: string[] }
  | { type: "CASH_TO_50" }
  | { type: "CUSTOM_PRICE_MOVE"; symbol: string; movePct: number };

export type ScenarioResult = {
  scenarioType: ScenarioType;
  scenarioName: string;
  estimatedEquity: number;
  estimatedPnl: number;
  estimatedPnlPct: number;
  riskLevelBefore: string;
  riskLevelAfter: string;
  confidence: "high" | "medium" | "low";
  beforeAfter: {
    equity: { before: number; after: number };
    cash: { before: number; after: number };
    exposurePct: { before: number; after: number };
    sectorExposurePct: { before: Record<string, number>; after: Record<string, number> };
  };
  positionImpact?: Array<{ symbol: string; currentValue: number; estimatedValue: number; deltaPct: number }>;
  pros: string[];
  cons: string[];
  notes: string[];
  recommendation: string;
};

function ihsgShockPct(type: "IHSG_DOWN_2" | "IHSG_DOWN_5" | "IHSG_DOWN_10" | "IHSG_UP_2"): number {
  switch (type) {
    case "IHSG_DOWN_2": return -2;
    case "IHSG_DOWN_5": return -5;
    case "IHSG_DOWN_10": return -10;
    case "IHSG_UP_2": return 2;
  }
}

export async function runPortfolioScenario(input: ScenarioInput): Promise<ScenarioResult> {
  const { health: healthBefore } = await calculatePortfolioHealth();
  const analytics: any = await getPortfolioAnalytics();
  const equity = Number(analytics?.equity ?? 0);
  const cash = Number(analytics?.cash ?? 0);
  const holdings = Number(analytics?.totalValue ?? 0);
  const exposureBefore = equity > 0 ? (holdings / equity) * 100 : 0;
  const positions = Array.isArray(analytics?.positions) ? analytics.positions : [];
  const attribPositions = Array.isArray(analytics?.attribution?.positions) ? analytics.attribution.positions : [];

  const sectorBefore: Record<string, number> = {};
  for (const p of positions) {
    const sec = p.sector ?? sectorOf(p.symbol);
    sectorBefore[sec] = (sectorBefore[sec] ?? 0) + (Number(p.value ?? 0) / Math.max(equity, 1)) * 100;
  }

  const { data: account } = await supabaseAdmin
    .from("paper_accounts").select("id").eq("user_id", currentUserId()).maybeSingle();
  const accountId = account?.id ?? null;

  let result: ScenarioResult;

  if (input.type === "IHSG_DOWN_2" || input.type === "IHSG_DOWN_5" || input.type === "IHSG_DOWN_10" || input.type === "IHSG_UP_2") {
    const shock = ihsgShockPct(input.type);
    const computed = (analytics?.scenarios ?? []).find((s: any) => s.benchmarkShockPct === shock);
    const realBetaCount = attribPositions.filter((p: any) => p.betaSource === "computed").length;
    const confidence: ScenarioResult["confidence"] =
      attribPositions.length === 0 ? "low"
      : realBetaCount / attribPositions.length >= 0.7 ? "high"
      : realBetaCount / attribPositions.length >= 0.3 ? "medium" : "low";

    const positionImpact = attribPositions.map((p: any) => {
      const beta = p.beta ?? SECTOR_BETA_PRIOR[p.sector as keyof typeof SECTOR_BETA_PRIOR] ?? 1;
      const deltaPct = beta * shock;
      const estValue = p.marketValue * (1 + deltaPct / 100);
      return { symbol: p.symbol, currentValue: p.marketValue, estimatedValue: estValue, deltaPct };
    });
    const estimatedPnl = computed?.estimatedPortfolioChange ?? 0;
    const estimatedEquity = computed?.estimatedEquity ?? equity + estimatedPnl;
    const newHoldings = positionImpact.reduce((s: number, p: { estimatedValue: number }) => s + p.estimatedValue, 0);
    const sectorAfter: Record<string, number> = {};
    for (const p of positionImpact) {
      const sec = sectorOf(p.symbol);
      sectorAfter[sec] = (sectorAfter[sec] ?? 0) + (p.estimatedValue / Math.max(estimatedEquity, 1)) * 100;
    }
    result = {
      scenarioType: input.type,
      scenarioName: `IHSG ${shock > 0 ? "+" : ""}${shock}%`,
      estimatedEquity,
      estimatedPnl,
      estimatedPnlPct: equity > 0 ? (estimatedPnl / equity) * 100 : 0,
      riskLevelBefore: healthBefore.riskLevel,
      riskLevelAfter: estimatedPnl < -equity * 0.05 ? "Risky" : healthBefore.riskLevel,
      confidence,
      beforeAfter: {
        equity: { before: equity, after: estimatedEquity },
        cash: { before: cash, after: cash },
        exposurePct: { before: exposureBefore, after: estimatedEquity > 0 ? (newHoldings / estimatedEquity) * 100 : 0 },
        sectorExposurePct: { before: sectorBefore, after: sectorAfter },
      },
      positionImpact,
      pros: shock > 0 ? [`Estimasi gain Rp ${Math.round(estimatedPnl).toLocaleString()}.`] : [],
      cons: shock < 0 ? [`Estimasi loss Rp ${Math.round(estimatedPnl).toLocaleString()}.`] : [],
      notes: confidence === "low" ? ["Beta data terbatas — memakai sektor prior, confidence low."] : [],
      recommendation: shock < 0 && estimatedPnl < -equity * 0.05
        ? "Pertimbangkan menambah cash buffer atau hedge sektor terkonsentrasi sebelum stress event."
        : "Posisi relatif tahan terhadap skenario ini.",
    };
  } else if (input.type === "SECTOR_DROP") {
    const positionImpact = attribPositions
      .filter((p: any) => p.sector === input.sector)
      .map((p: any) => {
        const estValue = p.marketValue * (1 + input.movePct / 100);
        return { symbol: p.symbol, currentValue: p.marketValue, estimatedValue: estValue, deltaPct: input.movePct };
      });
    const estimatedPnl = positionImpact.reduce((s: number, p: { estimatedValue: number; currentValue: number }) => s + (p.estimatedValue - p.currentValue), 0);
    const estimatedEquity = equity + estimatedPnl;
    result = {
      scenarioType: "SECTOR_DROP",
      scenarioName: `Sektor ${input.sector} ${input.movePct}%`,
      estimatedEquity, estimatedPnl,
      estimatedPnlPct: equity > 0 ? (estimatedPnl / equity) * 100 : 0,
      riskLevelBefore: healthBefore.riskLevel,
      riskLevelAfter: healthBefore.riskLevel,
      confidence: "medium",
      beforeAfter: {
        equity: { before: equity, after: estimatedEquity },
        cash: { before: cash, after: cash },
        exposurePct: { before: exposureBefore, after: exposureBefore },
        sectorExposurePct: { before: sectorBefore, after: sectorBefore },
      },
      positionImpact,
      pros: [], cons: input.movePct < 0 ? [`Sektor ${input.sector} terdampak Rp ${Math.round(estimatedPnl).toLocaleString()}.`] : [],
      notes: [], recommendation: positionImpact.length === 0 ? "Tidak ada eksposur di sektor tersebut." : "Pertimbangkan rebalance jika sektor jatuh tajam.",
    };
  } else if (input.type === "CLOSE_POSITION") {
    const sim: any = await simulatePortfolioWhatIf({ data: { action: "close", symbol: input.symbol } });
    if (sim?.error) {
      result = {
        scenarioType: "CLOSE_POSITION", scenarioName: `Close ${input.symbol}`,
        estimatedEquity: equity, estimatedPnl: 0, estimatedPnlPct: 0,
        riskLevelBefore: healthBefore.riskLevel, riskLevelAfter: healthBefore.riskLevel,
        confidence: "low",
        beforeAfter: {
          equity: { before: equity, after: equity }, cash: { before: cash, after: cash },
          exposurePct: { before: exposureBefore, after: exposureBefore },
          sectorExposurePct: { before: sectorBefore, after: sectorBefore },
        },
        pros: [], cons: [], notes: [sim.error], recommendation: "Posisi tidak ditemukan.",
      };
    } else {
      const newEquity = sim.newCash + (equity - cash - sim.currentMarketValue);
      result = {
        scenarioType: "CLOSE_POSITION", scenarioName: `Close ${input.symbol}`,
        estimatedEquity: newEquity, estimatedPnl: 0, estimatedPnlPct: 0,
        riskLevelBefore: healthBefore.riskLevel,
        riskLevelAfter: sim.newExposurePct < 20 ? "Stable" : healthBefore.riskLevel,
        confidence: "high",
        beforeAfter: {
          equity: { before: equity, after: newEquity },
          cash: { before: cash, after: sim.newCash },
          exposurePct: { before: exposureBefore, after: sim.newExposurePct },
          sectorExposurePct: { before: sectorBefore, after: sim.newSectorExposurePct },
        },
        pros: [`Cash naik menjadi Rp ${Math.round(sim.newCash).toLocaleString()}.`, `Realized P/L Rp ${Math.round(sim.realizedPnlIfClosedNow).toLocaleString()}.`],
        cons: sim.realizedPnlIfClosedNow < 0 ? ["Lock-in loss — tinjau ulang tesis."] : [],
        notes: sim.notes ?? [],
        recommendation: sim.realizedPnlIfClosedNow >= 0 ? "Aman ditutup jika tesis sudah tidak valid." : "Pertimbangkan menahan jika tesis original masih intact.",
      };
    }
  } else if (input.type === "REDUCE_POSITION") {
    const pos = positions.find((p: any) => p.symbol === input.symbol);
    if (!pos) {
      result = makeError("REDUCE_POSITION", `Reduce ${input.symbol}`, equity, cash, exposureBefore, sectorBefore, healthBefore.riskLevel, "Posisi tidak ditemukan.");
    } else {
      const reduceFrac = Math.max(0, Math.min(1, input.reducePct / 100));
      const proceeds = Number(pos.value ?? 0) * reduceFrac;
      const realizedPnlOnReduced = Number(pos.pnl ?? 0) * reduceFrac;
      const newCash = cash + proceeds;
      const newHoldings = holdings - proceeds;
      const newEquity = newCash + newHoldings;
      const newExposure = newEquity > 0 ? (newHoldings / newEquity) * 100 : 0;
      result = {
        scenarioType: "REDUCE_POSITION", scenarioName: `Reduce ${input.symbol} ${input.reducePct}%`,
        estimatedEquity: newEquity, estimatedPnl: 0, estimatedPnlPct: 0,
        riskLevelBefore: healthBefore.riskLevel, riskLevelAfter: healthBefore.riskLevel,
        confidence: "high",
        beforeAfter: {
          equity: { before: equity, after: newEquity },
          cash: { before: cash, after: newCash },
          exposurePct: { before: exposureBefore, after: newExposure },
          sectorExposurePct: { before: sectorBefore, after: sectorBefore },
        },
        pros: [`Cash naik Rp ${Math.round(proceeds).toLocaleString()}.`, `Realized P/L Rp ${Math.round(realizedPnlOnReduced).toLocaleString()}.`],
        cons: realizedPnlOnReduced < 0 ? ["Sebagian loss ter-realisasi."] : [],
        notes: ["Simulasi — paper order tidak dibuat. Partial sell harus diatur manual dari halaman chart."],
        recommendation: "Reduce membantu menurunkan concentration tanpa exit total.",
      };
    }
  } else if (input.type === "ADD_POSITION") {
    let price = 0;
    try {
      const q = await getQuotes({ data: { symbols: [input.symbol] } });
      price = Number(q?.[0]?.price ?? 0);
    } catch { /* */ }
    if (price <= 0) {
      result = makeError("ADD_POSITION", `Add ${input.symbol}`, equity, cash, exposureBefore, sectorBefore, healthBefore.riskLevel, "Harga terakhir tidak tersedia.");
    } else {
      const lot = Math.floor(input.amount / (price * 100));
      if (lot < 1) {
        result = makeError("ADD_POSITION", `Add ${input.symbol}`, equity, cash, exposureBefore, sectorBefore, healthBefore.riskLevel, `Lot di bawah minimum (butuh Rp ${Math.round(price * 100).toLocaleString()} per lot).`);
      } else {
        const sim: any = await simulatePortfolioWhatIf({ data: { action: "add", symbol: input.symbol, lot, price } });
        const estCost = sim.estCost ?? price * lot * 100;
        const newCash = sim.newCash ?? Math.max(0, cash - estCost);
        const newHoldings = holdings + estCost;
        const newEquity = newCash + newHoldings;
        result = {
          scenarioType: "ADD_POSITION", scenarioName: `Add ${input.symbol} ${lot} lot`,
          estimatedEquity: newEquity, estimatedPnl: 0, estimatedPnlPct: 0,
          riskLevelBefore: healthBefore.riskLevel,
          riskLevelAfter: sim?.newExposurePct > 80 ? "Risky" : healthBefore.riskLevel,
          confidence: "high",
          beforeAfter: {
            equity: { before: equity, after: newEquity },
            cash: { before: cash, after: newCash },
            exposurePct: { before: exposureBefore, after: sim?.newExposurePct ?? exposureBefore },
            sectorExposurePct: { before: sectorBefore, after: sim?.newSectorExposurePct ?? sectorBefore },
          },
          pros: [`Estimasi ${lot} lot @ Rp ${Math.round(price).toLocaleString()}.`],
          cons: sim?.affordable === false ? ["Cash tidak cukup."] : [],
          notes: ["Simulasi — paper order tidak dibuat. Gunakan tombol Open Paper Trade untuk eksekusi."],
          recommendation: sim?.affordable === false ? "Kurangi amount atau tambah cash dulu." : "Layak ditambah jika exposure tetap di bawah batas.",
        };
      }
    }
  } else if (input.type === "DEPLOY_CASH") {
    const deployFrac = Math.max(0, Math.min(1, input.deployPct / 100));
    const cashToDeploy = cash * deployFrac;
    const newCash = cash - cashToDeploy;
    const newHoldings = holdings + cashToDeploy;
    const newEquity = newCash + newHoldings;
    const newExposure = newEquity > 0 ? (newHoldings / newEquity) * 100 : 0;
    result = {
      scenarioType: "DEPLOY_CASH", scenarioName: `Deploy ${input.deployPct}% cash`,
      estimatedEquity: newEquity, estimatedPnl: 0, estimatedPnlPct: 0,
      riskLevelBefore: healthBefore.riskLevel,
      riskLevelAfter: newExposure > 80 ? "Risky" : healthBefore.riskLevel,
      confidence: "medium",
      beforeAfter: {
        equity: { before: equity, after: newEquity },
        cash: { before: cash, after: newCash },
        exposurePct: { before: exposureBefore, after: newExposure },
        sectorExposurePct: { before: sectorBefore, after: sectorBefore },
      },
      pros: [`Cash to deploy: Rp ${Math.round(cashToDeploy).toLocaleString()}.`, `Remaining cash: Rp ${Math.round(newCash).toLocaleString()}.`],
      cons: newExposure > 80 ? ["Eksposur > 80% — buffer kecil."] : [],
      notes: input.targetSymbols?.length ? [`Target: ${input.targetSymbols.join(", ")}.`] : ["Alokasi target belum dipilih — saran: top watchlist score, sektor strength."],
      recommendation: healthBefore.marketRegime === "risk_off" ? "Hindari deploy agresif saat regime risk-off." : "Deploy bertahap (tranche) untuk minimisasi timing risk.",
    };
  } else if (input.type === "CASH_TO_50") {
    const targetCash = equity * 0.5;
    const cashDelta = targetCash - cash;
    result = {
      scenarioType: "CASH_TO_50", scenarioName: "Rebalance to 50% cash",
      estimatedEquity: equity, estimatedPnl: 0, estimatedPnlPct: 0,
      riskLevelBefore: healthBefore.riskLevel, riskLevelAfter: "Stable",
      confidence: "medium",
      beforeAfter: {
        equity: { before: equity, after: equity },
        cash: { before: cash, after: targetCash },
        exposurePct: { before: exposureBefore, after: 50 },
        sectorExposurePct: { before: sectorBefore, after: sectorBefore },
      },
      pros: cashDelta > 0 ? [`Perlu jual ekuivalen Rp ${Math.round(cashDelta).toLocaleString()}.`] : [`Perlu beli ekuivalen Rp ${Math.round(-cashDelta).toLocaleString()}.`],
      cons: [], notes: ["Simulasi rebalance — tidak otomatis."],
      recommendation: "Cocok untuk defensive posture menjelang stress event.",
    };
  } else if (input.type === "CUSTOM_PRICE_MOVE") {
    // CUSTOM_PRICE_MOVE
    const pos = positions.find((p: any) => p.symbol === input.symbol);
    if (!pos) {
      result = makeError("CUSTOM_PRICE_MOVE", `Custom ${input.symbol}`, equity, cash, exposureBefore, sectorBefore, healthBefore.riskLevel, "Posisi tidak ditemukan.");
    } else {
      const estValue = Number(pos.value ?? 0) * (1 + input.movePct / 100);
      const estPnl = estValue - Number(pos.value ?? 0);
      const newEquity = equity + estPnl;
      result = {
        scenarioType: "CUSTOM_PRICE_MOVE", scenarioName: `${input.symbol} ${input.movePct > 0 ? "+" : ""}${input.movePct}%`,
        estimatedEquity: newEquity, estimatedPnl: estPnl,
        estimatedPnlPct: equity > 0 ? (estPnl / equity) * 100 : 0,
        riskLevelBefore: healthBefore.riskLevel, riskLevelAfter: healthBefore.riskLevel,
        confidence: "high",
        beforeAfter: {
          equity: { before: equity, after: newEquity },
          cash: { before: cash, after: cash },
          exposurePct: { before: exposureBefore, after: newEquity > 0 ? ((holdings + estPnl) / newEquity) * 100 : 0 },
          sectorExposurePct: { before: sectorBefore, after: sectorBefore },
        },
        positionImpact: [{ symbol: input.symbol, currentValue: Number(pos.value ?? 0), estimatedValue: estValue, deltaPct: input.movePct }],
        pros: estPnl > 0 ? [`Gain Rp ${Math.round(estPnl).toLocaleString()}.`] : [],
        cons: estPnl < 0 ? [`Loss Rp ${Math.round(estPnl).toLocaleString()}.`] : [],
        notes: [], recommendation: "",
      };
    }
  } else {
    throw new Error(`Unknown scenario type: ${(input as { type: string }).type}`);
  }

  // Persist
  if (accountId) {
    await supabaseAdmin.from("portfolio_scenario_results").insert({
      account_id: accountId,
      user_id: currentUserId(),
      scenario_type: result.scenarioType,
      scenario_name: result.scenarioName,
      input_payload: input as any,
      result_payload: result as any,
      estimated_equity: result.estimatedEquity,
      estimated_pnl: result.estimatedPnl,
      estimated_pnl_pct: result.estimatedPnlPct,
      risk_level_before: result.riskLevelBefore,
      risk_level_after: result.riskLevelAfter,
      confidence: result.confidence,
      notes: result.notes,
    });
  }

  return result;
}

function makeError(
  scenarioType: ScenarioType, scenarioName: string,
  equity: number, cash: number, exposureBefore: number,
  sectorBefore: Record<string, number>, riskLevel: string, msg: string,
): ScenarioResult {
  return {
    scenarioType, scenarioName,
    estimatedEquity: equity, estimatedPnl: 0, estimatedPnlPct: 0,
    riskLevelBefore: riskLevel, riskLevelAfter: riskLevel,
    confidence: "low",
    beforeAfter: {
      equity: { before: equity, after: equity },
      cash: { before: cash, after: cash },
      exposurePct: { before: exposureBefore, after: exposureBefore },
      sectorExposurePct: { before: sectorBefore, after: sectorBefore },
    },
    pros: [], cons: [], notes: [msg], recommendation: msg,
  };
}
