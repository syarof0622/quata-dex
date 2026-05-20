// Phase B: Portfolio risk snapshot. Computes exposure / concentration / drawdown
// from current paper positions + recent orders. Saves to portfolio_risk_snapshots.
import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getQuotes } from "./market.functions";
import { sectorOf } from "./sectors";

const USER_ID = "00000000-0000-0000-0000-000000000001";

export type PortfolioRisk = {
  paper_account_id: string;
  gross_exposure: number;
  net_exposure: number;
  cash_pct: number;
  concentration_hhi: number;
  max_position_weight: number;
  sector_concentration: Record<string, number>;
  current_drawdown: number;
  daily_pnl: number;
  daily_pnl_pct: number;
  trades_today: number;
  risk_level: "low" | "moderate" | "elevated" | "high";
  warnings: string[];
};

export const computePortfolioRisk = createServerFn({ method: "GET" }).handler(
  async (): Promise<PortfolioRisk | null> => {
    const { data: account } = await supabaseAdmin
      .from("paper_accounts")
      .select("*")
      .eq("user_id", USER_ID)
      .maybeSingle();
    if (!account) return null;

    const { data: positions } = await supabaseAdmin
      .from("paper_positions")
      .select("*")
      .eq("user_id", USER_ID);
    const pos = (positions ?? []) as any[];

    const symbols = Array.from(new Set(pos.map((p) => p.symbol as string)));
    const quotes = symbols.length ? await getQuotes({ data: { symbols } }) : [];
    const priceMap = new Map<string, number>(
      quotes.map((q: any) => [q.symbol, Number(q.price ?? 0)]),
    );

    let gross = 0;
    const valueBySymbol: Record<string, number> = {};
    const valueBySector: Record<string, number> = {};
    for (const p of pos) {
      const price = priceMap.get(p.symbol) ?? Number(p.avg_price);
      const value = price * Number(p.qty);
      gross += value;
      valueBySymbol[p.symbol] = (valueBySymbol[p.symbol] ?? 0) + value;
      const sec = sectorOf(p.symbol);
      valueBySector[sec] = (valueBySector[sec] ?? 0) + value;
    }
    const equity = Number(account.cash ?? 0) + gross;
    const cashPct = equity > 0 ? (Number(account.cash) / equity) * 100 : 100;

    // HHI: sum of squared portfolio weights (%)
    let hhi = 0;
    let maxWeight = 0;
    for (const v of Object.values(valueBySymbol)) {
      const w = equity > 0 ? (v / equity) * 100 : 0;
      hhi += w * w;
      if (w > maxWeight) maxWeight = w;
    }
    const sectorConcPct: Record<string, number> = {};
    for (const [s, v] of Object.entries(valueBySector)) {
      sectorConcPct[s] = equity > 0 ? Number(((v / equity) * 100).toFixed(2)) : 0;
    }

    // Daily P&L from today's filled orders
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    const { data: todayOrders } = await supabaseAdmin
      .from("paper_orders")
      .select("realized_pnl, created_at")
      .eq("user_id", USER_ID)
      .eq("status", "filled")
      .gte("created_at", since.toISOString());
    const dailyPnl = (todayOrders ?? []).reduce(
      (s: number, o: any) => s + Number(o.realized_pnl ?? 0),
      0,
    );
    const tradesToday = (todayOrders ?? []).length;
    const dailyPnlPct = equity > 0 ? (dailyPnl / equity) * 100 : 0;

    // Drawdown from peak equity in last 30d using historical snapshots
    const { data: hist } = await supabaseAdmin
      .from("portfolio_risk_snapshots")
      .select("gross_exposure, created_at")
      .eq("paper_account_id", account.id)
      .order("created_at", { ascending: false })
      .limit(60);
    let peakEquity = equity;
    for (const h of hist ?? []) {
      const histEquity = Number((h as any).gross_exposure ?? 0); // approx
      if (histEquity > peakEquity) peakEquity = histEquity;
    }
    const drawdown = peakEquity > 0 ? ((equity - peakEquity) / peakEquity) * 100 : 0;

    const warnings: string[] = [];
    if (maxWeight > 25) warnings.push(`Konsentrasi tinggi: posisi terbesar ${maxWeight.toFixed(1)}%.`);
    if (hhi > 2500) warnings.push("Portofolio terlalu terkonsentrasi (HHI > 2500).");
    if (drawdown < -5) warnings.push(`Drawdown ${drawdown.toFixed(2)}% melewati ambang -5%.`);
    if (dailyPnlPct < -2) warnings.push(`Kerugian harian ${dailyPnlPct.toFixed(2)}% melewati -2%.`);
    for (const [s, w] of Object.entries(sectorConcPct)) {
      if (w > 40) warnings.push(`Konsentrasi sektor ${s}: ${w.toFixed(1)}%.`);
    }

    let riskLevel: PortfolioRisk["risk_level"] = "low";
    if (warnings.length >= 3 || drawdown < -8) riskLevel = "high";
    else if (warnings.length >= 2 || drawdown < -5) riskLevel = "elevated";
    else if (warnings.length >= 1) riskLevel = "moderate";

    const snapshot: PortfolioRisk = {
      paper_account_id: account.id,
      gross_exposure: Number(gross.toFixed(2)),
      net_exposure: Number(gross.toFixed(2)),
      cash_pct: Number(cashPct.toFixed(2)),
      concentration_hhi: Number(hhi.toFixed(0)),
      max_position_weight: Number(maxWeight.toFixed(2)),
      sector_concentration: sectorConcPct,
      current_drawdown: Number(drawdown.toFixed(2)),
      daily_pnl: Number(dailyPnl.toFixed(2)),
      daily_pnl_pct: Number(dailyPnlPct.toFixed(2)),
      trades_today: tradesToday,
      risk_level: riskLevel,
      warnings,
    };

    await supabaseAdmin.from("portfolio_risk_snapshots").insert(snapshot);
    return snapshot;
  },
);

export const getLatestPortfolioRisk = createServerFn({ method: "GET" }).handler(
  async () => {
    const { data: account } = await supabaseAdmin
      .from("paper_accounts")
      .select("id")
      .eq("user_id", USER_ID)
      .maybeSingle();
    if (!account) return null;
    const { data } = await supabaseAdmin
      .from("portfolio_risk_snapshots")
      .select("*")
      .eq("paper_account_id", account.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data;
  },
);
