// Phase B: Market regime detector. Uses Yahoo IDX (^JKSE) data to classify
// overall trend / volatility / breadth into a single regime label.
// NO_API_MODE safe — public Yahoo endpoint only.
import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

type Bar = { t: number; c: number };

async function fetchIdx(range = "6mo"): Promise<Bar[]> {
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/%5EJKSE?interval=1d&range=${range}`,
      { headers: { "User-Agent": UA, Accept: "application/json" } },
    );
    if (!r.ok) return [];
    const j = await r.json();
    const res = j?.chart?.result?.[0];
    const ts: number[] = res?.timestamp ?? [];
    const closes: (number | null)[] = res?.indicators?.quote?.[0]?.close ?? [];
    const out: Bar[] = [];
    for (let i = 0; i < ts.length; i++) {
      const c = closes[i];
      if (c != null && Number.isFinite(c)) out.push({ t: ts[i], c });
    }
    return out;
  } catch {
    return [];
  }
}

function sma(bars: Bar[], n: number): number | null {
  if (bars.length < n) return null;
  let s = 0;
  for (let i = bars.length - n; i < bars.length; i++) s += bars[i].c;
  return s / n;
}

function dailyReturns(bars: Bar[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const p = bars[i - 1].c;
    if (p) out.push((bars[i].c - p) / p);
  }
  return out;
}

function annualizedVol(rets: number[]): number {
  if (rets.length < 2) return 0;
  const m = rets.reduce((a, b) => a + b, 0) / rets.length;
  const v =
    rets.reduce((a, b) => a + (b - m) * (b - m), 0) / (rets.length - 1);
  return Math.sqrt(v) * Math.sqrt(252) * 100; // %
}

export type MarketRegime = {
  regime_trend: "uptrend" | "downtrend" | "sideways" | "unknown";
  regime_volatility: "low" | "normal" | "high" | "extreme" | "unknown";
  regime_breadth: "broad_up" | "broad_down" | "mixed" | "unknown";
  regime_classification:
    | "risk_on"
    | "risk_off"
    | "neutral"
    | "transition"
    | "insufficient_data";
  idx_level: number | null;
  idx_change_pct: number | null;
  breadth_pct: number | null;
  reasoning: string;
};

export const computeMarketRegime = createServerFn({ method: "GET" }).handler(
  async (): Promise<MarketRegime & { id?: string }> => {
    const bars = await fetchIdx("6mo");
    if (bars.length < 60) {
      const empty: MarketRegime = {
        regime_trend: "unknown",
        regime_volatility: "unknown",
        regime_breadth: "unknown",
        regime_classification: "insufficient_data",
        idx_level: null,
        idx_change_pct: null,
        breadth_pct: null,
        reasoning: "Data IDX tidak cukup untuk klasifikasi regime.",
      };
      return empty;
    }
    const last = bars[bars.length - 1].c;
    const sma20 = sma(bars, 20)!;
    const sma50 = sma(bars, 50)!;
    const change20 = ((last - bars[bars.length - 21].c) / bars[bars.length - 21].c) * 100;
    const vol = annualizedVol(dailyReturns(bars.slice(-60)));

    let trend: MarketRegime["regime_trend"] = "sideways";
    if (last > sma20 && sma20 > sma50 && change20 > 2) trend = "uptrend";
    else if (last < sma20 && sma20 < sma50 && change20 < -2) trend = "downtrend";

    let volLabel: MarketRegime["regime_volatility"] = "normal";
    if (vol < 12) volLabel = "low";
    else if (vol < 22) volLabel = "normal";
    else if (vol < 35) volLabel = "high";
    else volLabel = "extreme";

    // Approx breadth: % of last-20 days that closed positive
    const r20 = dailyReturns(bars.slice(-21));
    const breadth = r20.length
      ? (r20.filter((x) => x > 0).length / r20.length) * 100
      : null;
    let breadthLabel: MarketRegime["regime_breadth"] = "mixed";
    if (breadth != null) {
      if (breadth >= 60) breadthLabel = "broad_up";
      else if (breadth <= 40) breadthLabel = "broad_down";
    }

    let cls: MarketRegime["regime_classification"] = "neutral";
    if (trend === "uptrend" && volLabel !== "extreme") cls = "risk_on";
    else if (trend === "downtrend" || volLabel === "extreme") cls = "risk_off";
    else if (trend === "sideways" && volLabel === "high") cls = "transition";

    const reasoning =
      `IDX last=${last.toFixed(0)} vs SMA20=${sma20.toFixed(0)}/SMA50=${sma50.toFixed(0)}, ` +
      `20D change=${change20.toFixed(2)}%, vol(ann)=${vol.toFixed(1)}%, breadth=${breadth?.toFixed(0) ?? "?"}%. ` +
      `Regime=${cls}.`;

    const snapshot = {
      regime_trend: trend,
      regime_volatility: volLabel,
      regime_breadth: breadthLabel,
      regime_classification: cls,
      idx_level: last,
      idx_change_pct: change20,
      breadth_pct: breadth,
      reasoning,
    };

    const { data } = await supabaseAdmin
      .from("market_regime_snapshots")
      .insert({
        ...snapshot,
        raw_payload: { last, sma20, sma50, change20, vol, breadth },
      })
      .select("id")
      .single();

    return { ...snapshot, id: data?.id };
  },
);

export const getLatestMarketRegime = createServerFn({ method: "GET" }).handler(
  async () => {
    const { data } = await supabaseAdmin
      .from("market_regime_snapshots")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data;
  },
);
