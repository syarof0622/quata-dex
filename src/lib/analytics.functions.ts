import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getQuotes, getCandles } from "./market.functions";
import { sectorOf } from "./sectors";

const USER_ID = "00000000-0000-0000-0000-000000000001";

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
  .handler(async () => {
    const { data: account } = await supabaseAdmin.from("paper_accounts").select("*").eq("user_id", USER_ID).maybeSingle();
    if (!account) return null;
    const [{ data: positions }, { data: orders }] = await Promise.all([
      supabaseAdmin.from("paper_positions").select("*").eq("account_id", account.id),
      supabaseAdmin.from("paper_orders").select("*").eq("account_id", account.id).eq("status", "filled").order("filled_at"),
    ]);

    const symbols = (positions ?? []).map((p: any) => p.symbol);
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
    const enriched = (positions ?? []).map((p: any) => {
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

    const cash = Number(account.cash);
    const equity = cash + totalValue;
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

    // Baseline: use account initial_balance (set on create/reset), fall back safely.
    const initialBalance = Number(
      (account as any).initial_balance ?? account.equity ?? account.cash ?? 0,
    );

    // Equity curve from persisted snapshots (true mark-to-market over time).
    // Falls back to a 2-point line (initial -> current) when history is empty.
    const { data: snaps } = await supabaseAdmin
      .from("portfolio_equity_snapshots")
      .select("equity, cash, holdings_value, created_at")
      .eq("paper_account_id", account.id)
      .order("created_at", { ascending: true })
      .limit(500);
    const curve: { time: number; equity: number; cash: number; holdings: number }[] = [];
    for (const s of (snaps ?? []) as any[]) {
      curve.push({
        time: Math.floor(new Date(s.created_at).getTime() / 1000),
        equity: Number(s.equity),
        cash: Number(s.cash ?? 0),
        holdings: Number(s.holdings_value ?? 0),
      });
    }
    // Always append the latest live equity as the most recent point.
    curve.push({
      time: Math.floor(Date.now() / 1000),
      equity, cash, holdings: totalValue,
    });

    const totalReturnAmount = initialBalance > 0 ? equity - initialBalance : 0;
    const pnlPct = initialBalance > 0 ? (totalReturnAmount / initialBalance) * 100 : 0;

    return {
      currency: (account as any).currency ?? "IDR",
      initialBalance,
      cash, equity, totalValue, totalCost,
      unrealized, realized: totalRealized,
      totalReturnAmount, pnlPct,
      exposure, concentration,
      beta, betaSamples,
      winRate, totalTrades,
      positions: enriched, sectorBreakdown, perSymbol,
      curve,
    };
  });

