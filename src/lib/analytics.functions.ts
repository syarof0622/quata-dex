import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getQuotes, getCandles } from "./market.functions";
import { sectorOf } from "./sectors";
import {
  SECTOR_BETA_PRIOR,
  betaFromReturns,
  annualizedVol,
  computeSectorAttribution,
  computeCashDrag,
  computeScenarios,
  simulateClose,
  simulateAdd,
  type AttribPosition,
} from "./portfolio-attribution";

const USER_ID = "00000000-0000-0000-0000-000000000001";

type ClosedTrade = {
  symbol: string;
  qty: number;
  entryPrice: number;
  exitPrice: number;
  realized: number;
  returnPct: number;
  closedAt: string;
  closeReason: string;
};

// FIFO walk producing realized PnL + closed-trade events.
function fifoWalk(orders: any[], symbol: string): {
  realized: number;
  trades: number;
  wins: number;
  grossProfit: number;
  grossLoss: number;
  best: number;
  worst: number;
  closed: ClosedTrade[];
} {
  const lots: { qty: number; price: number }[] = [];
  let realized = 0, trades = 0, wins = 0, grossProfit = 0, grossLoss = 0;
  let best = -Infinity, worst = Infinity;
  const closed: ClosedTrade[] = [];
  const sorted = [...orders].sort((a, b) =>
    new Date(a.filled_at ?? a.created_at).getTime() - new Date(b.filled_at ?? b.created_at).getTime());
  for (const o of sorted) {
    const qty = Number(o.qty);
    const price = Number(o.filled_price ?? o.price ?? 0);
    if (o.side === "buy") {
      lots.push({ qty, price });
    } else {
      let remaining = qty;
      let cost = 0;
      let avgEntry = 0;
      const startRemaining = remaining;
      while (remaining > 0 && lots.length) {
        const lot = lots[0];
        const take = Math.min(lot.qty, remaining);
        cost += take * lot.price;
        avgEntry += take * lot.price;
        lot.qty -= take;
        remaining -= take;
        if (lot.qty <= 1e-9) lots.shift();
      }
      const filledQty = startRemaining - remaining;
      const entryAvg = filledQty ? avgEntry / filledQty : 0;
      const pnl = qty * price - cost - Number(o.fee ?? 0);
      realized += pnl;
      trades++;
      if (pnl > 0) { wins++; grossProfit += pnl; }
      else { grossLoss += pnl; }
      if (pnl > best) best = pnl;
      if (pnl < worst) worst = pnl;
      closed.push({
        symbol,
        qty,
        entryPrice: entryAvg,
        exitPrice: price,
        realized: pnl,
        returnPct: cost > 0 ? (pnl / cost) * 100 : 0,
        closedAt: o.filled_at ?? o.created_at,
        closeReason: o.close_reason ?? "manual_sell",
      });
    }
  }
  return {
    realized, trades, wins, grossProfit, grossLoss,
    best: best === -Infinity ? 0 : best,
    worst: worst === Infinity ? 0 : worst,
    closed,
  };
}

export const getPortfolioAnalytics = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data: account } = await supabaseAdmin.from("paper_accounts").select("*").eq("user_id", USER_ID).maybeSingle();
    if (!account) return null;

    // Self-heal initial_balance if NULL (legacy accounts).
    const accountAny = account as any;
    if (accountAny.initial_balance == null) {
      const seed = Number(account.equity ?? account.cash ?? 100000000);
      await supabaseAdmin.from("paper_accounts").update({ initial_balance: seed }).eq("id", account.id);
      accountAny.initial_balance = seed;
    }

    const [{ data: positions }, { data: orders }, { data: exitPlans }] = await Promise.all([
      supabaseAdmin.from("paper_positions").select("*").eq("account_id", account.id),
      supabaseAdmin.from("paper_orders").select("*").eq("account_id", account.id).eq("status", "filled").order("filled_at"),
      supabaseAdmin
        .from("position_exit_plans")
        .select("symbol, stop_loss, take_profit, trailing_stop, trailing_stop_pct, risk_reward_ratio, management_status, reason")
        .eq("account_id", account.id),
    ]);
    const planBySymbol = new Map<string, any>();
    for (const p of (exitPlans ?? [])) planBySymbol.set((p as any).symbol, p);

    const symbols = (positions ?? []).map((p: any) => p.symbol);
    let quotes: any[] = [];
    if (symbols.length) {
      try { quotes = await getQuotes({ data: { symbols } }); } catch { quotes = []; }
    }
    const priceBy: Record<string, number> = {};
    const priceStale = new Set<string>();
    quotes.forEach(q => {
      if (q.price) priceBy[q.symbol] = q.price;
      else priceStale.add(q.symbol);
    });

    let benchCandles: any[] = [];
    try {
      benchCandles = await getCandles({ data: { symbol: "^JKSE", timeframe: "1d" } });
    } catch {/* */}
    const benchReturns: number[] = [];
    for (let i = 1; i < benchCandles.length; i++) {
      benchReturns.push((benchCandles[i].close - benchCandles[i - 1].close) / benchCandles[i - 1].close);
    }

    let totalValue = 0, totalCost = 0, unrealized = 0;
    const enriched = (positions ?? []).map((p: any) => {
      const livePrice = priceBy[p.symbol];
      const last = livePrice ?? Number(p.avg_price);
      const stale = livePrice == null;
      const qty = Number(p.qty);
      const avg = Number(p.avg_price);
      const value = last * qty;
      const cost = avg * qty;
      const pnl = value - cost;
      totalValue += value; totalCost += cost; unrealized += pnl;
      const plan = planBySymbol.get(p.symbol);
      const stopLoss = plan?.stop_loss != null ? Number(plan.stop_loss) : null;
      const takeProfit = plan?.take_profit != null ? Number(plan.take_profit) : null;
      const trailingStop = plan?.trailing_stop != null ? Number(plan.trailing_stop) : null;
      return {
        symbol: p.symbol, qty, avg, last, value, cost, pnl,
        pnlPct: cost ? (pnl / cost) * 100 : 0,
        sector: sectorOf(p.symbol),
        lot: qty / 100,
        openedAt: p.opened_at,
        stale,
        stopLoss,
        takeProfit,
        trailingStop,
        trailingStopPct: plan?.trailing_stop_pct != null ? Number(plan.trailing_stop_pct) : null,
        riskRewardRatio: plan?.risk_reward_ratio != null ? Number(plan.risk_reward_ratio) : null,
        managementStatus: (plan?.management_status as string | undefined) ?? null,
        exitPlanReason: (plan?.reason as string | undefined) ?? null,
        distanceToStopPct: stopLoss != null && last > 0 ? ((last - stopLoss) / last) * 100 : null,
        distanceToTakeProfitPct: takeProfit != null && last > 0 ? ((takeProfit - last) / last) * 100 : null,
        hasExitPlan: !!plan,
      };
    });

    const cash = Number(account.cash);
    const equity = cash + totalValue;
    const exposure = equity ? (totalValue / equity) * 100 : 0;
    const cashRatio = equity ? (cash / equity) * 100 : 100;
    const top = [...enriched].sort((a, b) => b.value - a.value)[0];
    const concentration = totalValue && top ? (top.value / equity) * 100 : 0;
    const maxPositionWeight = concentration;

    // Sector breakdown
    const sectorMap: Record<string, number> = {};
    for (const p of enriched) {
      sectorMap[p.sector] = (sectorMap[p.sector] ?? 0) + p.value;
    }
    const sectorBreakdown = Object.entries(sectorMap)
      .map(([sector, value]) => ({ sector, value, pct: equity ? (value / equity) * 100 : 0 }))
      .sort((a, b) => b.value - a.value);
    const largestSectorPct = sectorBreakdown[0]?.pct ?? 0;

    // Closed-trade accounting (FIFO per symbol).
    const ordersBySymbol = new Map<string, any[]>();
    for (const o of orders ?? []) {
      const list = ordersBySymbol.get(o.symbol) ?? [];
      list.push(o);
      ordersBySymbol.set(o.symbol, list);
    }
    let totalRealized = 0, closedCount = 0, totalWins = 0, grossProfit = 0, grossLoss = 0;
    let bestTrade = 0, worstTrade = 0;
    const perSymbol: Record<string, { realized: number; trades: number; wins: number }> = {};
    const allClosed: ClosedTrade[] = [];
    for (const [sym, list] of ordersBySymbol) {
      const r = fifoWalk(list, sym);
      perSymbol[sym] = { realized: r.realized, trades: r.trades, wins: r.wins };
      totalRealized += r.realized;
      closedCount += r.trades;
      totalWins += r.wins;
      grossProfit += r.grossProfit;
      grossLoss += r.grossLoss;
      if (r.best > bestTrade) bestTrade = r.best;
      if (r.worst < worstTrade) worstTrade = r.worst;
      allClosed.push(...r.closed);
    }
    allClosed.sort((a, b) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime());
    const recentClosedTrades = allClosed.slice(0, 10);

    // Win rate / profit factor are UNDEFINED until there is at least one closed trade.
    // Returning 0 here would lie ("0% win rate" implies all-loss). UI shows N/A on null.
    const winRate: number | null = closedCount > 0 ? (totalWins / closedCount) * 100 : null;
    const profitFactor: number | null = closedCount === 0
      ? null
      : (grossLoss < 0 ? grossProfit / Math.abs(grossLoss) : (grossProfit > 0 ? Infinity : 0));

    const executedOrdersCount = (orders ?? []).length;
    const openPositionsCount = enriched.length;

    // Beta proxy
    let beta: number | null = null;
    let betaSamples = 0;
    if (top && benchReturns.length > 30) {
      try {
        const c = await getCandles({ data: { symbol: top.symbol, timeframe: "1d" } });
        const r: number[] = [];
        for (let i = 1; i < c.length; i++) r.push((c[i].close - c[i - 1].close) / c[i - 1].close);
        const n = Math.min(r.length, benchReturns.length);
        betaSamples = n;
        if (n >= 30) {
          const a = r.slice(-n), b = benchReturns.slice(-n);
          const meanA = a.reduce((x, y) => x + y, 0) / n;
          const meanB = b.reduce((x, y) => x + y, 0) / n;
          let cov = 0, varB = 0;
          for (let i = 0; i < n; i++) {
            cov += (a[i] - meanA) * (b[i] - meanB);
            varB += (b[i] - meanB) ** 2;
          }
          beta = varB ? cov / varB : null;
        }
      } catch {/* */}
    }

    const initialBalance = Number(accountAny.initial_balance ?? account.equity ?? account.cash ?? 0);

    // Equity curve from snapshots, filtered by reset_at.
    const resetAt = accountAny.reset_at as string | null;
    let snapQuery = supabaseAdmin
      .from("portfolio_equity_snapshots")
      .select("equity, cash, holdings_value, created_at")
      .eq("paper_account_id", account.id)
      .order("created_at", { ascending: true })
      .limit(500);
    if (resetAt) snapQuery = snapQuery.gte("created_at", resetAt);
    const { data: snaps } = await snapQuery;
    const curve: { time: number; equity: number; cash: number; holdings: number }[] = [];
    for (const s of (snaps ?? []) as any[]) {
      curve.push({
        time: Math.floor(new Date(s.created_at).getTime() / 1000),
        equity: Number(s.equity),
        cash: Number(s.cash ?? 0),
        holdings: Number(s.holdings_value ?? 0),
      });
    }

    // Drawdown from snapshot peak (true equity history, not exposure).
    let peakEquity = initialBalance > 0 ? initialBalance : equity;
    for (const c of curve) if (c.equity > peakEquity) peakEquity = c.equity;
    if (equity > peakEquity) peakEquity = equity;
    const drawdown = peakEquity > 0 ? ((equity - peakEquity) / peakEquity) * 100 : 0;

    // Persist a fresh snapshot if last one is stale (> 5min) — feeds equity curve.
    const lastSnap = (snaps ?? [])[(snaps ?? []).length - 1] as any;
    const lastSnapAt = lastSnap ? new Date(lastSnap.created_at).getTime() : 0;
    if (Date.now() - lastSnapAt > 5 * 60 * 1000) {
      await supabaseAdmin.from("portfolio_equity_snapshots").insert({
        paper_account_id: account.id,
        equity, cash, holdings_value: totalValue,
        realized_pnl: totalRealized, unrealized_pnl: unrealized,
      });
      curve.push({
        time: Math.floor(Date.now() / 1000),
        equity, cash, holdings: totalValue,
      });
    }
    // Sync stale account.equity for downstream readers.
    if (Math.abs(Number(account.equity ?? 0) - equity) > 1) {
      await supabaseAdmin.from("paper_accounts").update({ equity }).eq("id", account.id);
    }

    // Daily P&L from today's filled SELL orders.
    const since = new Date(); since.setHours(0, 0, 0, 0);
    const todayClosed = allClosed.filter(t => new Date(t.closedAt) >= since);
    const dailyPnl = todayClosed.reduce((s, t) => s + t.realized, 0);
    const dailyPnlPct = equity > 0 ? (dailyPnl / equity) * 100 : 0;

    // Risk warnings + level.
    const warnings: string[] = [];
    if (openPositionsCount > 1 && maxPositionWeight > 30) warnings.push(`Konsentrasi tinggi: posisi terbesar ${maxPositionWeight.toFixed(1)}%`);
    if (largestSectorPct > 40 && openPositionsCount > 1) warnings.push(`Eksposur sektor terbesar ${largestSectorPct.toFixed(1)}% > 40%`);
    if (cashRatio < 10 && openPositionsCount > 0) warnings.push(`Cash buffer rendah (${cashRatio.toFixed(1)}%)`);
    if (drawdown < -5) warnings.push(`Drawdown ${drawdown.toFixed(2)}% melewati -5%`);
    if (dailyPnlPct < -2) warnings.push(`Kerugian harian ${dailyPnlPct.toFixed(2)}% melewati -2%`);

    let riskLevel: "low" | "moderate" | "elevated" | "high" = "low";
    if (warnings.length >= 3 || drawdown < -8) riskLevel = "high";
    else if (warnings.length >= 2 || drawdown < -5) riskLevel = "elevated";
    else if (warnings.length >= 1) riskLevel = "moderate";

    const totalReturnAmount = initialBalance > 0 ? equity - initialBalance : 0;
    const pnlPct = initialBalance > 0 ? (totalReturnAmount / initialBalance) * 100 : 0;

    // Consistency validator (best-effort, returns flags only).
    const consistency: string[] = [];
    if (Math.abs(equity - (cash + totalValue)) > 1) consistency.push("equity_mismatch");
    if (!Number.isFinite(pnlPct)) consistency.push("pnl_pct_invalid");
    if (exposure > 100.5) consistency.push("exposure_exceeds_100");

    // ---------- ATTRIBUTION + SCENARIOS ----------
    // Per-position beta & volatility: only fetch candles when position count is small,
    // otherwise fall back to sector prior to keep upstream quota safe.
    const baselineForContribution = initialBalance > 0 ? initialBalance : equity || 1;
    const fetchPerPosBeta = enriched.length > 0 && enriched.length <= 12 && benchReturns.length > 30;
    const positionStats = await Promise.all(
      enriched.map(async (p) => {
        let beta: number | null = null;
        let vol: number | null = null;
        let betaSource: "computed" | "sector_prior" = "sector_prior";
        if (fetchPerPosBeta) {
          try {
            const c = await getCandles({ data: { symbol: p.symbol, timeframe: "1d" } });
            const r: number[] = [];
            for (let i = 1; i < c.length; i++) r.push((c[i].close - c[i - 1].close) / c[i - 1].close);
            const b = betaFromReturns(r, benchReturns);
            if (b != null && Number.isFinite(b)) { beta = b; betaSource = "computed"; }
            vol = annualizedVol(r);
          } catch {/* ignore — fall back */}
        }
        if (beta == null) beta = SECTOR_BETA_PRIOR[p.sector] ?? 1;
        return { symbol: p.symbol, beta, betaSource, vol };
      }),
    );
    const statsBy = new Map(positionStats.map((s) => [s.symbol, s]));

    const attribPositions: AttribPosition[] = enriched.map((p) => {
      const s = statsBy.get(p.symbol)!;
      const weight = equity ? (p.value / equity) * 100 : 0;
      return {
        symbol: p.symbol,
        sector: p.sector as any,
        marketValue: p.value,
        weight,
        unrealizedPnl: p.pnl,
        unrealizedPnlPct: p.pnlPct,
        contributionToReturn: baselineForContribution ? (p.pnl / baselineForContribution) * 100 : 0,
        contributionToRisk: 0, // filled below after normalisation
        beta: s.beta,
        betaSource: s.betaSource,
        volatility: s.vol,
      };
    });
    // Risk contribution = weight × volatility (or |beta| as fallback), normalised to sum to 100.
    const rawRisk = attribPositions.map((p) => (p.weight / 100) * ((p.volatility ?? (Math.abs(p.beta ?? 1) * 20))));
    const rawSum = rawRisk.reduce((s, v) => s + v, 0);
    attribPositions.forEach((p, i) => {
      p.contributionToRisk = rawSum > 0 ? (rawRisk[i] / rawSum) * 100 : 0;
    });
    const sectorAttribution = computeSectorAttribution(attribPositions, equity, baselineForContribution);
    const cashDrag = computeCashDrag({ cash, equity, benchReturns, lookbackDays: 60 });
    const scenarios = computeScenarios({ positions: attribPositions, equity });

    const sortedByContrib = [...attribPositions].sort((a, b) => b.contributionToReturn - a.contributionToReturn);
    const topContributor = sortedByContrib[0] ?? null;
    const worstContributor = sortedByContrib.length ? sortedByContrib[sortedByContrib.length - 1] : null;

    return {
      currency: accountAny.currency ?? "IDR",
      initialBalance,
      cash, equity, totalValue, totalCost,
      unrealized, realized: totalRealized,
      totalReturnAmount, pnlPct,
      exposure, concentration, maxPositionWeight, cashRatio, largestSectorPct,
      drawdown, dailyPnl, dailyPnlPct,
      beta, betaSamples,
      winRate, totalTrades: closedCount,
      executedOrdersCount, openPositionsCount, closedTradesCount: closedCount,
      profitFactor: profitFactor != null && Number.isFinite(profitFactor) ? profitFactor : (profitFactor === Infinity ? null : profitFactor),
      bestTrade, worstTrade,
      riskLevel, warnings,
      positions: enriched, sectorBreakdown, perSymbol,
      curve, recentClosedTrades,
      lastUpdated: new Date().toISOString(),
      priceStaleSymbols: Array.from(priceStale),
      consistency,
      // Attribution & scenario block
      attribution: {
        positions: attribPositions,
        sectors: sectorAttribution,
        topContributor: topContributor ? { symbol: topContributor.symbol, contributionToReturn: topContributor.contributionToReturn, unrealizedPnl: topContributor.unrealizedPnl } : null,
        worstContributor: worstContributor && worstContributor !== topContributor
          ? { symbol: worstContributor.symbol, contributionToReturn: worstContributor.contributionToReturn, unrealizedPnl: worstContributor.unrealizedPnl }
          : null,
        baselineForContribution,
        betaCoverage: fetchPerPosBeta
          ? `${positionStats.filter((s) => s.betaSource === "computed").length}/${positionStats.length} computed`
          : `0/${positionStats.length} computed (sector_prior only)`,
      },
      cashDrag,
      scenarios,
    };
  });

// ----- What-if simulator (read-only) -----
export const simulatePortfolioWhatIf = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.discriminatedUnion("action", [
      z.object({ action: z.literal("close"), symbol: z.string().min(1) }),
      z.object({
        action: z.literal("add"),
        symbol: z.string().min(1),
        lot: z.number().positive().max(100000),
        price: z.number().positive().optional(),
      }),
    ]).parse(d),
  )
  .handler(async ({ data }) => {
    const { data: account } = await supabaseAdmin
      .from("paper_accounts").select("*").eq("user_id", USER_ID).maybeSingle();
    if (!account) return { error: "Paper account belum diinisialisasi." };
    const { data: positions } = await supabaseAdmin
      .from("paper_positions").select("*").eq("account_id", account.id);

    const symbols = (positions ?? []).map((p: any) => p.symbol);
    let quotes: any[] = [];
    if (symbols.length) {
      try { quotes = await getQuotes({ data: { symbols } }); } catch { quotes = []; }
    }
    const priceBy: Record<string, number> = {};
    quotes.forEach((q) => { if (q.price) priceBy[q.symbol] = q.price; });

    const enriched: AttribPosition[] = (positions ?? []).map((p: any) => {
      const qty = Number(p.qty);
      const avg = Number(p.avg_price);
      const last = priceBy[p.symbol] ?? avg;
      const value = last * qty;
      const pnl = (last - avg) * qty;
      return {
        symbol: p.symbol,
        sector: sectorOf(p.symbol) as any,
        marketValue: value,
        weight: 0,
        unrealizedPnl: pnl,
        unrealizedPnlPct: avg ? (pnl / (avg * qty)) * 100 : 0,
        contributionToReturn: 0,
        contributionToRisk: 0,
        beta: null,
        betaSource: "sector_prior",
        volatility: null,
      };
    });
    const cash = Number(account.cash);
    const totalValue = enriched.reduce((s, p) => s + p.marketValue, 0);
    const equity = cash + totalValue;
    enriched.forEach((p) => { p.weight = equity ? (p.marketValue / equity) * 100 : 0; });

    if (data.action === "close") {
      return simulateClose({ positions: enriched, cash, equity, symbol: data.symbol });
    }
    // add — resolve price from quote if not provided
    let price = data.price ?? 0;
    if (!price) {
      try {
        const q = await getQuotes({ data: { symbols: [data.symbol] } });
        price = Number(q?.[0]?.price ?? 0);
      } catch {/* */}
    }
    return simulateAdd({ positions: enriched, cash, equity, symbol: data.symbol, lot: data.lot, price });
  });
