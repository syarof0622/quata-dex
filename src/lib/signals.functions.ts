import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { scoreSignal, type Candle } from "./indicators";
import { getCandles } from "./market.functions";
import { compositeSignal, buildTradeSetup } from "@/features/signals/composite-engine";
import { detectSRZones } from "@/features/signals/sr-engine";
import { detectRegime } from "@/features/signals/regime";

// Legacy single-factor signal (kept for backwards compatibility)
export const getSignal = createServerFn({ method: "POST" })
  .inputValidator((d: { symbol: string; timeframe?: string }) => z.object({
    symbol: z.string().min(1),
    timeframe: z.string().optional().default("1d"),
  }).parse(d))
  .handler(async ({ data }) => {
    const candles = (await getCandles({ data: { symbol: data.symbol, timeframe: data.timeframe } })) as Candle[];
    if (!candles.length) return null;
    const sig = scoreSignal(candles);
    const last = candles[candles.length - 1];
    return {
      symbol: data.symbol,
      timeframe: data.timeframe,
      price: last.close,
      ...sig,
      computedAt: new Date().toISOString(),
    };
  });

// Multi-factor v2 with multi-timeframe confirmation
export const getAdvancedSignal = createServerFn({ method: "POST" })
  .inputValidator((d: { symbol: string; timeframe?: string; mtf?: boolean }) => z.object({
    symbol: z.string().min(1).toUpperCase(),
    timeframe: z.string().optional().default("1d"),
    mtf: z.boolean().optional().default(true),
  }).parse(d))
  .handler(async ({ data }) => {
    const primary = (await getCandles({ data: { symbol: data.symbol, timeframe: data.timeframe } })) as Candle[];
    if (primary.length < 60) return null;

    let mtfBias: number | undefined;
    if (data.mtf) {
      // Higher TFs to confirm the primary direction
      const higherTFs = data.timeframe === "1d" ? ["1wk"]
        : data.timeframe === "1h" ? ["1d", "4h"]
        : data.timeframe === "15m" ? ["1h", "1d"]
        : ["1d"];
      const others = await Promise.all(
        higherTFs.map(tf => getCandles({ data: { symbol: data.symbol, timeframe: tf } }) as Promise<Candle[]>),
      );
      const scores = others
        .filter(c => c.length >= 60)
        .map(c => compositeSignal(c, data.symbol, "_").score);
      if (scores.length) mtfBias = scores.reduce((a, b) => a + b, 0) / scores.length;
    }

    return compositeSignal(primary, data.symbol, data.timeframe, mtfBias);
  });

export const getTradeSetup = createServerFn({ method: "POST" })
  .inputValidator((d: { symbol: string; timeframe?: string }) => z.object({
    symbol: z.string().min(1).toUpperCase(),
    timeframe: z.string().optional().default("1d"),
  }).parse(d))
  .handler(async ({ data }) => {
    const candles = (await getCandles({ data: { symbol: data.symbol, timeframe: data.timeframe } })) as Candle[];
    if (candles.length < 60) return null;
    const signal = compositeSignal(candles, data.symbol, data.timeframe);
    const setup = buildTradeSetup(candles, signal);
    // Override signal.risk to reflect stop distance — wide stops force minimum risk floors
    const sd = setup.stopDistancePct;
    let minRisk = 0;
    if (sd > 30) minRisk = 80;
    else if (sd > 20) minRisk = 65;
    else if (sd > 10) minRisk = 45;
    if (minRisk > 0 && signal.risk < minRisk) {
      signal.risk = Math.min(95, minRisk);
      signal.riskLabel = signal.risk <= 30 ? "Low" : signal.risk <= 60 ? "Medium" : signal.risk <= 80 ? "High" : "Extreme";
    }
    // Gate executionStatus on setup quality (Poor → No Trade, Fair/conditional → Wait)
    const grade = setup.quality.grade;
    if (signal.label !== "HOLD") {
      if (grade === "Poor" || sd > 30) {
        signal.executionStatus = "No Trade";
        signal.executionReason = grade === "Poor"
          ? `Setup quality Poor (${setup.quality.score}/100) — skip atau watch only.`
          : `Stop distance ${sd.toFixed(1)}% terlalu lebar — no actionable setup.`;
      } else if ((grade === "Fair" || setup.conditional) && signal.executionStatus === "Ready to Trade") {
        signal.executionStatus = "Wait for Confirmation";
        signal.executionReason = setup.conditionalReason
          ?? `Setup quality ${grade} — tunggu konfirmasi trigger sebelum eksekusi.`;
      }
    }
    return { signal, setup };
  });

export const getSupportResistance = createServerFn({ method: "POST" })
  .inputValidator((d: { symbol: string; timeframe?: string }) => z.object({
    symbol: z.string().min(1).toUpperCase(),
    timeframe: z.string().optional().default("1d"),
  }).parse(d))
  .handler(async ({ data }) => {
    const candles = (await getCandles({ data: { symbol: data.symbol, timeframe: data.timeframe } })) as Candle[];
    if (candles.length < 30) return [];
    return detectSRZones(candles);
  });

export const getMarketRegime = createServerFn({ method: "POST" })
  .inputValidator((d: { symbol: string; timeframe?: string }) => z.object({
    symbol: z.string().min(1).toUpperCase(),
    timeframe: z.string().optional().default("1d"),
  }).parse(d))
  .handler(async ({ data }) => {
    const candles = (await getCandles({ data: { symbol: data.symbol, timeframe: data.timeframe } })) as Candle[];
    if (candles.length < 60) return null;
    return detectRegime(candles);
  });
