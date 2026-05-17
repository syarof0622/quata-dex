import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getCandles } from "./market.functions";
import { ema, rsi, macd, type Candle } from "./indicators";

const USER_ID = "00000000-0000-0000-0000-000000000001";

export type BacktestResult = {
  metrics: {
    trades: number;
    winRate: number;
    totalReturnPct: number;
    maxDrawdownPct: number;
    sharpe: number;
    profitFactor: number;
    finalEquity: number;
  };
  equityCurve: { time: number; equity: number }[];
  trades: { entryTime: number; exitTime: number; entry: number; exit: number; pnlPct: number; side: "long" }[];
};

type Rule = "ema_cross" | "rsi_reversal" | "macd_cross";

function signalsForRule(rule: Rule, candles: Candle[]): number[] {
  // returns 1 = enter long, -1 = exit, 0 = hold (per index)
  const closes = candles.map(c => c.close);
  const out: number[] = new Array(candles.length).fill(0);
  if (rule === "ema_cross") {
    const f = ema(closes, 12), s = ema(closes, 26);
    for (let i = 1; i < closes.length; i++) {
      if (isNaN(f[i]) || isNaN(s[i])) continue;
      if (f[i] > s[i] && f[i - 1] <= s[i - 1]) out[i] = 1;
      else if (f[i] < s[i] && f[i - 1] >= s[i - 1]) out[i] = -1;
    }
  } else if (rule === "rsi_reversal") {
    const r = rsi(closes, 14);
    for (let i = 1; i < closes.length; i++) {
      if (r[i - 1] < 30 && r[i] >= 30) out[i] = 1;
      else if (r[i - 1] > 70 && r[i] <= 70) out[i] = -1;
    }
  } else {
    const m = macd(closes);
    for (let i = 1; i < closes.length; i++) {
      if (m.hist[i] > 0 && m.hist[i - 1] <= 0) out[i] = 1;
      else if (m.hist[i] < 0 && m.hist[i - 1] >= 0) out[i] = -1;
    }
  }
  return out;
}

export const runBacktest = createServerFn({ method: "POST" })
  .inputValidator((d: { symbol: string; timeframe?: string; rule?: Rule; startEquity?: number; persist?: boolean; strategyId?: string }) =>
    z.object({
      symbol: z.string().min(1).toUpperCase(),
      timeframe: z.string().optional().default("1d"),
      rule: z.enum(["ema_cross", "rsi_reversal", "macd_cross"]).optional().default("ema_cross"),
      startEquity: z.number().positive().optional().default(100000),
      persist: z.boolean().optional().default(false),
      strategyId: z.string().uuid().optional(),
    }).parse(d))
  .handler(async ({ data }) => {
    const candles = (await getCandles({ data: { symbol: data.symbol, timeframe: data.timeframe } })) as Candle[];
    if (candles.length < 60) throw new Error("Not enough data to backtest");
    const sig = signalsForRule(data.rule, candles);

    let equity = data.startEquity;
    let position = 0;
    let entry = 0;
    let entryTime = 0;
    const trades: BacktestResult["trades"] = [];
    const curve: { time: number; equity: number }[] = [];
    let peak = equity;
    let maxDD = 0;
    const returns: number[] = [];

    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      if (position === 0 && sig[i] === 1) {
        position = equity / c.close;
        entry = c.close;
        entryTime = c.time;
      } else if (position > 0 && (sig[i] === -1 || i === candles.length - 1)) {
        const exit = c.close;
        const pnlPct = (exit - entry) / entry * 100;
        equity = position * exit * (1 - 0.0015); // slippage+fee
        trades.push({ entryTime, exitTime: c.time, entry, exit, pnlPct, side: "long" });
        position = 0;
      }
      const eqNow = position > 0 ? position * c.close : equity;
      if (eqNow > peak) peak = eqNow;
      const dd = (peak - eqNow) / peak * 100;
      if (dd > maxDD) maxDD = dd;
      curve.push({ time: c.time, equity: eqNow });
      if (curve.length > 1) returns.push((eqNow - curve[curve.length - 2].equity) / curve[curve.length - 2].equity);
    }

    const wins = trades.filter(t => t.pnlPct > 0);
    const grossWin = wins.reduce((a, t) => a + t.pnlPct, 0);
    const grossLoss = Math.abs(trades.filter(t => t.pnlPct <= 0).reduce((a, t) => a + t.pnlPct, 0));
    const mean = returns.reduce((a, b) => a + b, 0) / Math.max(1, returns.length);
    const variance = returns.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, returns.length);
    const sharpe = Math.sqrt(252) * (mean / (Math.sqrt(variance) || 1));
    const finalEquity = curve[curve.length - 1]?.equity ?? equity;

    const metrics = {
      trades: trades.length,
      winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
      totalReturnPct: ((finalEquity - data.startEquity) / data.startEquity) * 100,
      maxDrawdownPct: maxDD,
      sharpe: isFinite(sharpe) ? sharpe : 0,
      profitFactor: grossLoss ? grossWin / grossLoss : grossWin > 0 ? 99 : 0,
      finalEquity,
    };

    if (data.persist) {
      await supabase.from("backtests").insert({
        user_id: userId, symbol: data.symbol, timeframe: data.timeframe,
        strategy_id: (data.strategyId ?? null) as any,
        metrics_json: metrics, equity_curve_json: curve.slice(-500) as any,
      });
    }

    return { metrics, equityCurve: curve, trades } satisfies BacktestResult;
  });

export const listStrategies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.from("strategies").select("*").eq("user_id", context.userId).order("created_at", { ascending: false });
    return data ?? [];
  });

export const saveStrategy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string; description?: string; rule: Rule }) =>
    z.object({ name: z.string().min(1), description: z.string().optional(), rule: z.enum(["ema_cross", "rsi_reversal", "macd_cross"]) }).parse(d))
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase.from("strategies").insert({
      user_id: context.userId, name: data.name, description: data.description ?? null,
      rules_json: { rule: data.rule }, ai_generated: false,
    }).select().single();
    if (error) throw error;
    return row;
  });
