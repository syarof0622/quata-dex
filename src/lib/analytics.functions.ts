import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getQuotes, getCandles } from "./market.functions";
import { sectorOf } from "./sectors";

// Compute realized PnL from a FIFO walk of paper_orders for a single symbol
function realizedFromOrders(orders: any[]): { realized: number; trades: number; wins: number } {
  const lots: { qty: number; price: number }[] = [];
  let realized = 0, trades = 0, wins = 0;
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
      while (remaining > 0 && lots.length) {
        const lot = lots[0];
        const take = Math.min(lot.qty, remaining);
        cost += take * lot.price;
        lot.qty -= take;
        remaining -= take;
        if (lot.qty <= 1e-9) lots.shift();
      }
      const pnl = qty * price - cost;
      realized += pnl;
      trades++;
      if (pnl > 0) wins++;
    }
  }
  return { realized, trades, wins };
}

export const getPortfolioAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: account } = await supabase.from("paper_accounts").select("*").eq("user_id", userId).maybeSingle();
    if (!account) return null;
    const [{ data: positions }, { data: orders }] = await Promise.all([
      supabase.from("paper_positions").select("*").eq("account_id", account.id),
      supabase.from("paper_orders").select("*").eq("account_id", account.id).eq("status", "filled").order("filled_at"),
    ]);

    const symbols = (positions ?? []).map(p => p.symbol);
    let quotes: any[] = [];
    if (symbols.length) {
      try { quotes = await getQuotes({ data: { symbols } }); } catch { quotes = []; }
    }
    const priceBy: Record<string, number> = {};
    quotes.forEach(q => { if (q.price) priceBy[q.symbol] = q.price; });

    let benchCandles: any[] = [];
    try {
      benchCandles = await getCandles({ data: { symbol: "^JKSE", timeframe: "1d" } });
    } catch {/* */}
    const benchReturns: number[] = [];
    for (let i = 1; i < benchCandles.length; i++) {
      benchReturns.push((benchCandles[i].close - benchCandles[i - 1].close) / benchCandles[i - 1].close);
    }

    let totalValue = 0, totalCost = 0, unrealized = 0;
    const enriched = (positions ?? []).map(p => {
      const last = priceBy[p.symbol] ?? Number(p.avg_price);
      const value = last * Number(p.qty);
      const cost = Number(p.avg_price) * Number(p.qty);
      const pnl = value - cost;
      totalValue += value; totalCost += cost; unrealized += pnl;
      return {
        symbol: p.symbol, qty: Number(p.qty), avg: Number(p.avg_price),
        last, value, cost, pnl, pnlPct: cost ? (pnl / cost) * 100 : 0,
        sector: sectorOf(p.symbol),
      };
    });

    const equity = Number(account.cash) + totalValue;
    const exposure = equity ? (totalValue / equity) * 100 : 0;
    const top = [...enriched].sort((a, b) => b.value - a.value)[0];
    const concentration = totalValue && top ? (top.value / equity) * 100 : 0;

    // Sector breakdown
    const sectorMap: Record<string, number> = {};
    for (const p of enriched) {
      sectorMap[p.sector] = (sectorMap[p.sector] ?? 0) + p.value;
    }
    const sectorBreakdown = Object.entries(sectorMap)
      .map(([sector, value]) => ({ sector, value, pct: equity ? (value / equity) * 100 : 0 }))
      .sort((a, b) => b.value - a.value);

    // Realized PnL per symbol
    const ordersBySymbol = new Map<string, any[]>();
    for (const o of orders ?? []) {
      const list = ordersBySymbol.get(o.symbol) ?? [];
      list.push(o);
      ordersBySymbol.set(o.symbol, list);
    }
    let totalRealized = 0, totalTrades = 0, totalWins = 0;
    const perSymbol: Record<string, { realized: number; trades: number; wins: number }> = {};
    for (const [sym, list] of ordersBySymbol) {
      const r = realizedFromOrders(list);
      perSymbol[sym] = r;
      totalRealized += r.realized;
      totalTrades += r.trades;
      totalWins += r.wins;
    }
    const winRate = totalTrades ? (totalWins / totalTrades) * 100 : 0;

    // Beta proxy: correlation of biggest position to benchmark
    let beta = 1;
    if (top && benchReturns.length > 30) {
      try {
        const c = await getCandles({ data: { symbol: top.symbol, timeframe: "1d" } });
        const r: number[] = [];
        for (let i = 1; i < c.length; i++) r.push((c[i].close - c[i - 1].close) / c[i - 1].close);
        const n = Math.min(r.length, benchReturns.length);
        const a = r.slice(-n), b = benchReturns.slice(-n);
        const meanA = a.reduce((x, y) => x + y, 0) / n;
        const meanB = b.reduce((x, y) => x + y, 0) / n;
        let cov = 0, varB = 0;
        for (let i = 0; i < n; i++) {
          cov += (a[i] - meanA) * (b[i] - meanB);
          varB += (b[i] - meanB) ** 2;
        }
        beta = varB ? cov / varB : 1;
      } catch {/* */}
    }

    // Equity curve from order history (very rough — assumes static cash baseline 100k)
    const baseline = 100000;
    const curve: { time: number; equity: number }[] = [];
    let running = baseline;
    let runningRealized = 0;
    for (const o of (orders ?? [])) {
      const t = new Date(o.filled_at ?? o.created_at).getTime() / 1000;
      // running = baseline + cumulative realized; unrealized added at end
      curve.push({ time: t, equity: running + runningRealized });
    }
    // Recompute properly with FIFO realized stream
    {
      const lotsBySym = new Map<string, { qty: number; price: number }[]>();
      let cum = 0;
      curve.length = 0;
      const sorted = [...(orders ?? [])].sort((a, b) =>
        new Date(a.filled_at ?? a.created_at).getTime() - new Date(b.filled_at ?? b.created_at).getTime());
      for (const o of sorted) {
        const lots = lotsBySym.get(o.symbol) ?? [];
        const qty = Number(o.qty);
        const price = Number(o.filled_price ?? o.price ?? 0);
        if (o.side === "buy") {
          lots.push({ qty, price });
        } else {
          let rem = qty, cost = 0;
          while (rem > 0 && lots.length) {
            const lot = lots[0];
            const take = Math.min(lot.qty, rem);
            cost += take * lot.price;
            lot.qty -= take;
            rem -= take;
            if (lot.qty <= 1e-9) lots.shift();
          }
          cum += qty * price - cost;
        }
        lotsBySym.set(o.symbol, lots);
        const t = new Date(o.filled_at ?? o.created_at).getTime() / 1000;
        curve.push({ time: t, equity: baseline + cum });
      }
      curve.push({ time: Math.floor(Date.now() / 1000), equity: equity });
      running = baseline + cum;
    }

    return {
      cash: Number(account.cash),
      equity, totalValue, totalCost, unrealized, realized: totalRealized,
      pnlPct: baseline ? ((equity - baseline) / baseline) * 100 : 0,
      exposure, concentration, beta,
      winRate, totalTrades,
      positions: enriched, sectorBreakdown, perSymbol,
      curve,
    };
  });
