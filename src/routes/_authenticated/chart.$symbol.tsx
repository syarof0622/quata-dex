import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { getQuote } from "@/lib/market.functions";
import {
  getSignal,
  getAdvancedSignal,
  getTradeSetup,
  getSupportResistance,
  getMarketRegime,
} from "@/lib/signals.functions";
import { getMarketContext } from "@/lib/market-context.functions";
import { addToWatchlist } from "@/lib/watchlist.functions";
import { smartMoney, newsSentiment } from "@/lib/sentiment.functions";
import { placeOrder, placeAdvancedOrder } from "@/lib/paper.functions";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { formatPct, formatPrice, colorForChange } from "@/lib/format";
import { formatLocalPrice, symbolMarket, priceCurrency } from "@/lib/symbols";
import { motion } from "framer-motion";
import { Star, TrendingUp, Target, ShieldAlert, Zap, PanelRightClose, PanelRightOpen } from "lucide-react";
import { toast } from "sonner";
import { FundamentalPanel } from "@/components/FundamentalPanel";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";

export const Route = createFileRoute("/_authenticated/chart/$symbol")({
  head: ({ params }) => ({ meta: [{ title: `${params.symbol} — Chart · Quanta Terminal` }] }),
  component: ChartPage,
});

const TFS = ["5", "15", "60", "240", "D", "W"] as const;
const TF_LABEL: Record<(typeof TFS)[number], string> = {
  "5": "5m", "15": "15m", "60": "1h", "240": "4h", D: "1D", W: "1W",
};
const TF_FULL: Record<(typeof TFS)[number], string> = {
  "5": "5-Minute", "15": "15-Minute", "60": "1-Hour", "240": "4-Hour", D: "Daily", W: "Weekly",
};
const tfToYf = (tf: string) =>
  tf === "D" ? "1d" : tf === "W" ? "1wk" : tf === "60" ? "1h" : tf === "240" ? "4h" : `${tf}m`;

function tvSymbol(sym: string): string {
  const s = sym.toUpperCase();
  if (s.startsWith("^")) {
    const m: Record<string, string> = {
      "^GSPC": "SP:SPX", "^IXIC": "NASDAQ:IXIC", "^DJI": "DJ:DJI",
      "^RUT": "TVC:RUT", "^VIX": "TVC:VIX",
      "^JKSE": "TVC:IDX", "^JKLQ45": "IDX:LQ45",
      "^N225": "TVC:NI225", "^HSI": "TVC:HSI", "^STI": "TVC:STI",
    };
    return m[s] ?? `TVC:${s.slice(1)}`;
  }
  if (s.endsWith(".JK")) return `IDX:${s.replace(".JK", "")}`;
  if (s.endsWith("-USD")) return `BINANCE:${s.replace("-", "")}T`;
  return s;
}

function ChartPage() {
  const { symbol } = useParams({ from: "/_authenticated/chart/$symbol" });
  const [tf, setTf] = useState<(typeof TFS)[number]>("D");
  const containerRef = useRef<HTMLDivElement>(null);
  const yfTf = tfToYf(tf);
  const isIDX = symbolMarket(symbol) === "idx";

  const quote = useQuery({
    queryKey: ["quote", symbol],
    queryFn: () => getQuote({ data: { symbol } }),
    refetchInterval: 10000,
  });
  const advSignal = useQuery({
    queryKey: ["advsignal", symbol, yfTf],
    queryFn: () => getAdvancedSignal({ data: { symbol, timeframe: yfTf, mtf: true } }),
    refetchInterval: 60000,
  });
  const setup = useQuery({
    queryKey: ["setup", symbol, yfTf],
    queryFn: () => getTradeSetup({ data: { symbol, timeframe: yfTf } }),
    refetchInterval: 60000,
  });
  const sr = useQuery({
    queryKey: ["sr", symbol, yfTf],
    queryFn: () => getSupportResistance({ data: { symbol, timeframe: yfTf } }),
    refetchInterval: 5 * 60_000,
  });
  const regime = useQuery({
    queryKey: ["regime", symbol, yfTf],
    queryFn: () => getMarketRegime({ data: { symbol, timeframe: yfTf } }),
    refetchInterval: 5 * 60_000,
  });
  const mctx = useQuery({
    queryKey: ["mctx", symbol],
    queryFn: () => getMarketContext({ data: { symbol } }),
    refetchInterval: 10 * 60_000,
    staleTime: 5 * 60_000,
  });
  // Legacy signal kept as backup if advanced not ready
  const legacy = useQuery({
    queryKey: ["signal", symbol, tf],
    queryFn: () => getSignal({ data: { symbol, timeframe: yfTf } }),
    enabled: !advSignal.data,
  });

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    el.innerHTML = "";
    const widgetEl = document.createElement("div");
    widgetEl.style.height = "100%";
    widgetEl.style.width = "100%";
    el.appendChild(widgetEl);
    const script = document.createElement("script");
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;
    script.onload = () => {
      const TV = (window as any).TradingView;
      if (!TV) return;
      new TV.widget({
        autosize: true,
        symbol: tvSymbol(symbol),
        interval: tf,
        timezone: "Asia/Jakarta",
        theme: "dark",
        style: "1",
        locale: "en",
        toolbar_bg: "#0B1220",
        enable_publishing: false,
        hide_side_toolbar: false,
        allow_symbol_change: true,
        container_id: widgetEl.id || (widgetEl.id = "tv_chart_container"),
        studies: ["MASimple@tv-basicstudies", "RSI@tv-basicstudies", "MACD@tv-basicstudies"],
        backgroundColor: "#0B1220",
        gridColor: "rgba(255,255,255,0.04)",
      });
    };
    el.appendChild(script);
    return () => { el.innerHTML = ""; };
  }, [symbol, tf]);

  const sig = advSignal.data;
  const labelDisplay = sig?.label?.replace("_", " ") ?? legacy.data?.label ?? "—";
  const sigColor =
    sig?.label === "STRONG_BUY" || sig?.label === "BUY"
      ? "text-bull bg-bull-soft"
      : sig?.label === "STRONG_SELL" || sig?.label === "SELL"
      ? "text-bear bg-bear-soft"
      : "text-muted-foreground bg-accent/30";

  const fmt = (n: number | null | undefined) =>
    isIDX ? formatLocalPrice(symbol, n) : formatPrice(n);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-3 p-3">
      <div className="space-y-3 min-w-0">
        {/* Header */}
        <div className="panel p-4 flex flex-wrap items-center gap-4">
          <div>
            <div className="text-xs text-muted-foreground">{quote.data?.exchange ?? (isIDX ? "IDX" : "—")}</div>
            <div className="text-2xl font-semibold">{symbol}</div>
            <div className="text-xs text-muted-foreground">{quote.data?.shortName ?? ""}</div>
          </div>
          <div className="ml-auto flex items-end gap-6">
            <div className="text-right">
              <div className="font-mono text-3xl">{fmt(quote.data?.price)}</div>
              <div className={`font-mono text-sm ${colorForChange(quote.data?.changePercent)}`}>
                {fmt(quote.data?.change)} · {formatPct(quote.data?.changePercent)} <span className="text-muted-foreground">{priceCurrency(symbol)}</span>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await addToWatchlist({ data: { symbol } });
                toast.success(`Added ${symbol} to watchlist`);
              }}
            >
              <Star className="size-4" />
            </Button>
          </div>
        </div>

        {/* TradingView Chart */}
        <div className="panel p-3">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {TFS.map((t) => (
              <Button key={t} size="sm" variant={t === tf ? "default" : "ghost"} onClick={() => setTf(t)}>
                {TF_LABEL[t]}
              </Button>
            ))}
            <span className="ml-auto text-[11px] text-muted-foreground">Powered by TradingView</span>
          </div>
          <div ref={containerRef} className="h-[520px] w-full" />
        </div>

        {/* Bottom tabs */}
        <div className="panel p-4">
          <Tabs defaultValue="setup">
            <TabsList>
              <TabsTrigger value="setup">Trade Setup</TabsTrigger>
              <TabsTrigger value="reasoning">AI Reasoning</TabsTrigger>
              <TabsTrigger value="sr">Support/Resistance</TabsTrigger>
              <TabsTrigger value="technical">Technical</TabsTrigger>
              <TabsTrigger value="fundamental">Fundamental</TabsTrigger>
              <TabsTrigger value="smart">Smart Money</TabsTrigger>
            </TabsList>

            <TabsContent value="setup">
              <TradeSetupPanel
                setup={setup.data?.setup}
                signal={setup.data?.signal}
                fmt={fmt}
                onPlace={async (side, qty) => {
                  await placeOrder({ data: { symbol, side, qty } });
                  toast.success(`${side.toUpperCase()} ${qty} ${symbol} filled`);
                }}
                price={quote.data?.price ?? sig?.price ?? 0}
              />
            </TabsContent>

            <TabsContent value="reasoning">
              <ReasoningPanel signal={sig} regime={regime.data} mctx={mctx.data} setup={setup.data?.setup} symbol={symbol} fmt={fmt} />
            </TabsContent>

            <TabsContent value="sr">
              <SRPanel zones={sr.data ?? []} price={quote.data?.price ?? sig?.price ?? 0} fmt={fmt} />
            </TabsContent>

            <TabsContent value="technical">
              <TVAnalysisWidget symbol={tvSymbol(symbol)} interval={tf} />
            </TabsContent>
            <TabsContent value="fundamental" className="text-sm text-muted-foreground">
              Market cap:{" "}
              <span className="font-mono">{quote.data?.marketCap?.toLocaleString() ?? "—"}</span> ·
              Currency: {quote.data?.currency ?? priceCurrency(symbol)}
            </TabsContent>
            <TabsContent value="smart">
              <SmartMoneyPanel symbol={symbol} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Right panel — AI Signal */}
      <div className="space-y-3">
        <motion.div
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          className="panel p-4"
        >
          <div className="flex items-center gap-2">
            <TrendingUp className="size-4 text-primary" />
            <h3 className="font-semibold">AI Signal · {TF_FULL[tf]}</h3>
            {sig?.dataQuality && <DataQualityBadge q={sig.dataQuality} notes={sig.dataNotes} />}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Signal is calculated based on the selected timeframe.
          </div>
          <div className={`mt-3 inline-flex px-3 py-1.5 rounded-md font-semibold text-sm ${sigColor}`}>
            {labelDisplay}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <Stat label="Confidence" value={sig?.confidence ?? legacy.data?.confidence} suffix="%"
              hint={sig?.confidenceLabel} tip="How much the model trusts this signal: blends factor agreement, signal magnitude, volatility and data quality." />
            <Stat label="AI Score" value={sig?.score ?? legacy.data?.score}
              tip="Composite directional score from -100 (strong sell) to +100 (strong buy)." />
            <Stat label="Risk" value={sig?.risk} hint={sig?.riskLabel}
              tip="0–30 Low · 31–60 Medium · 61–80 High · 81–100 Extreme. Driven by ATR%, regime volatility, choppiness and data quality." />
          </div>
          {sig && (
            <>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <Stat label="Trend Strength" value={sig.trendStrength} hint={sig.trendStrengthLabel}
                  tip="ADX-based: 0–20 Weak · 21–40 Developing · 41–70 Strong · 71–100 Very Strong." />
                <Stat label="Volatility" value={sig.volatilityLevel} tip="ATR% bucket — low / medium / high." />
                <Stat label="Continuation Probability" value={sig.probContinuation} suffix="%"
                  tip="Heuristic chance the current move continues over the next bars." />
                <Stat label="Reversal Probability" value={sig.probReversal} suffix="%"
                  tip="Heuristic chance of a reversal — complement of continuation." />
              </div>
              <div className="mt-3 grid grid-cols-5 gap-1 text-[10px]">
                {Object.entries(sig.factors).map(([k, v]) => (
                  <FactorBar key={k} label={k} value={v as number} />
                ))}
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                Style: <span className="text-foreground capitalize">{sig.recommendedStyle}</span> · Regime:{" "}
                <span className="text-foreground capitalize">{sig.regime.trend}/{sig.regime.phase}</span>
              </div>
              {sig.invalidations.length > 0 && (
                <div className="mt-3 text-xs">
                  <div className="flex items-center gap-1 text-bear mb-1"><ShieldAlert className="size-3" /> Invalidations</div>
                  <ul className="space-y-1 text-muted-foreground">
                    {sig.invalidations.map((r, i) => <li key={i}>• {r}</li>)}
                  </ul>
                </div>
              )}
              {sig.dataQuality !== "high" && (
                <div className="mt-3 text-[11px] text-muted-foreground border-t border-border pt-2">
                  Signal confidence reduced due to {sig.dataQuality === "low" ? "low" : "limited"}-quality data.
                </div>
              )}
            </>
          )}
          {!sig && legacy.data?.reasons && (
            <div className="mt-3">
              <div className="text-xs text-muted-foreground mb-1">Reasoning</div>
              <ul className="text-xs space-y-1">
                {legacy.data.reasons.map((r: string, i: number) => <li key={i}>• {r}</li>)}
              </ul>
            </div>
          )}
        </motion.div>

        <SentimentPanel symbol={symbol} />
        <PaperTrade
          symbol={symbol}
          price={quote.data?.price ?? 0}
          fmt={fmt}
          bias={setup.data?.setup?.bias as ("long" | "short" | "neutral" | undefined)}
          signalLabel={sig?.label}
        />
      </div>
    </div>
  );
}

function DataQualityBadge({ q, notes }: { q: "high" | "medium" | "low"; notes?: string[] }) {
  const cls = q === "high" ? "bg-bull-soft text-bull"
    : q === "medium" ? "bg-accent/40 text-foreground"
    : "bg-bear-soft text-bear";
  return (
    <span title={notes?.join(" · ")} className={`ml-auto text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${cls}`}>
      Data {q}
    </span>
  );
}

function Stat({ label, value, suffix, hint, tip }: {
  label: string;
  value: number | string | null | undefined;
  suffix?: string;
  hint?: string;
  tip?: string;
}) {
  return (
    <div className="panel-2 p-2" title={tip}>
      <div className="text-muted-foreground flex items-center justify-between gap-1">
        <span className="truncate">{label}</span>
        {tip && <span className="text-[9px] opacity-50">ⓘ</span>}
      </div>
      <div className="font-mono text-sm capitalize">
        {value == null || value === "" ? "—" : typeof value === "number" ? value.toFixed(0) : value}{suffix ?? ""}
      </div>
      {hint && <div className="text-[10px] text-muted-foreground/80">{hint}</div>}
    </div>
  );
}

function FactorBar({ label, value }: { label: string; value: number }) {
  const pct = Math.min(100, Math.abs(value));
  const color = value > 5 ? "bg-bull" : value < -5 ? "bg-bear" : "bg-muted-foreground/40";
  return (
    <div>
      <div className="text-muted-foreground capitalize truncate">{label}</div>
      <div className="h-1.5 rounded bg-accent/40 overflow-hidden mt-0.5">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function TradeSetupPanel({
  setup, signal, fmt, onPlace, price,
}: {
  setup: any; signal: any; fmt: (n: any) => string;
  onPlace: (side: "buy" | "sell", qty: number) => Promise<void>; price: number;
}) {
  const [qty, setQty] = useState(10);
  if (!setup) return <div className="text-sm text-muted-foreground">Computing trade setup…</div>;
  if (setup.bias === "neutral") {
    return (
      <div className="text-sm text-muted-foreground flex items-center gap-2">
        <Zap className="size-4" /> No actionable setup — wait for clearer signal.
      </div>
    );
  }
  const long = setup.bias === "long";
  const q = setup.quality;
  const gradeTone =
    q?.grade === "Excellent" ? "bg-bull-soft text-bull border-bull/40" :
    q?.grade === "Good" ? "bg-bull-soft/70 text-bull border-bull/30" :
    q?.grade === "Fair" ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/30" :
    "bg-bear-soft text-bear border-bear/30";
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`px-2 py-1 rounded font-semibold ${long ? "bg-bull-soft text-bull" : "bg-bear-soft text-bear"}`}>
          {long ? "LONG" : "SHORT"} · {signal?.label?.replace("_", " ")}
        </span>
        {q && (
          <span className={`px-2 py-1 rounded text-xs font-semibold border ${gradeTone}`}>
            Setup quality: {q.grade} · {q.score}/100
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          Risk per trade: <span className="text-foreground">{setup.riskPerTradePct}%</span> · Suggested allocation:{" "}
          <span className="text-foreground">{setup.suggestedAllocationPct}%</span>
        </span>
      </div>

      {q && (
        <div className="rounded border border-border bg-card/40 p-3 space-y-2">
          <div className="text-xs text-muted-foreground">{q.summary}</div>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {q.reasons.map((r: any, i: number) => (
              <li key={i} className="flex items-start gap-2">
                <span className={r.ok ? "text-bull" : "text-bear"}>{r.ok ? "✓" : "✕"}</span>
                <span><span className="text-foreground">{r.label}:</span> <span className="text-muted-foreground">{r.detail}</span></span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Cell label="Entry (aggr.)" value={fmt(setup.entryAggressive)} tone="primary" />
        <Cell label="Entry (cons.)" value={fmt(setup.entryConservative)} />
        <Cell label="Stop Loss" value={fmt(setup.stopLoss)} tone="bear" />
        <Cell label="Invalidation" value={fmt(setup.invalidation)} tone="bear" />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <TPCell label="TP1" price={fmt(setup.tp1)} rr={setup.rrTp1} />
        <TPCell label="TP2" price={fmt(setup.tp2)} rr={setup.rrTp2} />
        <TPCell label="TP3" price={fmt(setup.tp3)} rr={setup.rrTp3} />
      </div>

      <div className="text-xs text-muted-foreground">{setup.trailingStop}</div>
      {setup.notes?.length > 0 && (
        <ul className="text-xs text-muted-foreground space-y-1">
          {setup.notes.map((n: string, i: number) => <li key={i}>• {n}</li>)}
        </ul>
      )}

      <div className="flex items-center gap-2 border-t border-border pt-3">
        <span className="text-xs text-muted-foreground">Paper order:</span>
        <Input type="number" min={1} value={qty} onChange={e => setQty(Math.max(1, parseInt(e.target.value || "1")))} className="w-24" />
        <span className="text-xs text-muted-foreground">≈ {fmt(price * qty)}</span>
        <Button size="sm" className="bg-bull text-primary-foreground hover:opacity-90" onClick={() => onPlace(long ? "buy" : "sell", qty)}>
          {long ? "Execute LONG" : "Execute SHORT"}
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">Edukatif. Bukan rekomendasi finansial.</p>
    </div>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: "primary" | "bear" | "bull" }) {
  const cls =
    tone === "primary" ? "text-primary"
    : tone === "bear" ? "text-bear"
    : tone === "bull" ? "text-bull"
    : "";
  return (
    <div className="panel-2 p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={`font-mono text-base ${cls}`}>{value}</div>
    </div>
  );
}

function TPCell({ label, price, rr }: { label: string; price: string; rr: number | null }) {
  return (
    <div className="panel-2 p-3">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><Target className="size-3" /> {label}</span>
        <span>RR {rr ?? "—"}</span>
      </div>
      <div className="font-mono text-base text-bull">{price}</div>
    </div>
  );
}

function ReasoningPanel({ signal, regime, mctx, setup, symbol, fmt }: {
  signal: any; regime: any; mctx: any; setup: any; symbol: string;
  fmt: (n: any) => string;
}) {
  if (!signal) return <div className="text-sm text-muted-foreground">Analyzing…</div>;

  const label = (signal.label || "HOLD").replace("_", " ");
  const long = signal.label === "BUY" || signal.label === "STRONG_BUY";
  const short = signal.label === "SELL" || signal.label === "STRONG_SELL";
  const hold = !long && !short;

  // ---- WHY ----
  const whyParts: string[] = [];
  if (signal.bullishFactors?.length) whyParts.push(`${signal.bullishFactors.length} faktor bullish`);
  if (signal.bearishFactors?.length) whyParts.push(`${signal.bearishFactors.length} faktor bearish`);
  whyParts.push(`confidence ${signal.confidence ?? 0}/100`);
  if (signal.trendStrength != null) whyParts.push(`ADX ${Math.round(signal.trendStrength)}`);
  const why = `${symbol} → ${label}: ${whyParts.join(" · ")}. ${signal.dataQuality !== "high" ? `Data ${signal.dataQuality} — perlakukan dengan hati-hati. ` : ""}${mctx?.summary ?? ""}`;

  // ---- BEST ACTION ----
  const q = setup?.quality;
  const grade = q?.grade as ("Excellent" | "Good" | "Fair" | "Poor" | undefined);
  let action = "Tunggu setup yang lebih jelas.";
  let actionDetail = "";
  if (hold) {
    action = "HOLD / WAIT";
    actionDetail = "Sinyal tidak cukup kuat untuk entry baru. Pantau breakout/breakdown atau perubahan regime.";
  } else if (!setup || setup.bias === "neutral") {
    action = "Tidak ada setup tervalidasi";
    actionDetail = "Sinyal arah ada, tetapi level entry/stop belum jelas.";
  } else if (grade === "Poor") {
    action = "SKIP atau paper-trade saja";
    actionDetail = `Setup ${grade} (${q.score}/100). Edge terlalu lemah; tunggu konfirmasi.`;
  } else if (grade === "Fair") {
    action = `Reduced size ${long ? "LONG" : "SHORT"}`;
    actionDetail = `Setup ${grade} (${q.score}/100). Pakai 25–50% dari posisi normal, ketat di stop.`;
  } else {
    action = `${long ? "LONG" : "SHORT"} per plan`;
    actionDetail = `Setup ${grade} (${q?.score}/100). Entry ${fmt(setup.entryAggressive)} · Stop ${fmt(setup.stopLoss)} · TP1 ${fmt(setup.tp1)} (R:R ${setup.rrTp1 ?? "—"}).`;
  }
  if (mctx?.alignment === "headwind" && !hold) {
    actionDetail += " Konteks market melawan — kurangi size atau tunggu perbaikan trend benchmark.";
  }

  return (
    <div className="space-y-4 text-sm">
      {/* WHY */}
      <div className="rounded border border-border bg-card/40 p-3">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Why this signal</div>
        <div className="text-foreground">{why}</div>
      </div>

      {/* MARKET CONTEXT */}
      {mctx && (
        <div className="rounded border border-border bg-card/40 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Market Context</div>
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${
              mctx.alignment === "supportive" ? "bg-bull-soft text-bull" :
              mctx.alignment === "headwind" ? "bg-bear-soft text-bear" :
              "bg-accent/40 text-foreground"
            }`}>{mctx.alignment.toUpperCase()}</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <CtxCell label={mctx.benchmark.name} value={`${mctx.benchmark.trend}`} sub={mctx.benchmark.change20d != null ? `${mctx.benchmark.change20d > 0 ? "+" : ""}${mctx.benchmark.change20d}% 20d` : "—"} />
            <CtxCell label={`Sektor ${mctx.sector.name}`} value={mctx.sector.proxy ? mctx.sector.trend : "n/a"} sub={mctx.sector.proxy ? (mctx.sector.change20d != null ? `${mctx.sector.change20d > 0 ? "+" : ""}${mctx.sector.change20d}% 20d` : "—") : "no proxy"} />
            <CtxCell label="Rel. strength vs index" value={mctx.relativeStrength.vsBenchmark != null ? `${mctx.relativeStrength.vsBenchmark > 0 ? "+" : ""}${mctx.relativeStrength.vsBenchmark}%` : "—"} sub={mctx.relativeStrength.vsBenchmark != null && mctx.relativeStrength.vsBenchmark > 0 ? "outperforming" : mctx.relativeStrength.vsBenchmark != null ? "underperforming" : ""} />
            <CtxCell label="Beta · Corr" value={`${mctx.beta ?? "—"} · ${mctx.correlation ?? "—"}`} sub={`Session: ${mctx.session}`} />
          </div>
        </div>
      )}

      {/* BULLISH / BEARISH */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded border border-bull/30 bg-bull-soft/20 p-3">
          <h4 className="font-semibold text-bull mb-2 text-xs uppercase tracking-wide">Bullish ({signal.bullishFactors?.length ?? 0})</h4>
          <ul className="space-y-1 text-xs">
            {(signal.bullishFactors ?? []).map((r: string, i: number) => <li key={i}>• {r}</li>)}
            {(!signal.bullishFactors || signal.bullishFactors.length === 0) && <li className="text-muted-foreground">Tidak ada faktor bullish dominan.</li>}
          </ul>
        </div>
        <div className="rounded border border-bear/30 bg-bear-soft/20 p-3">
          <h4 className="font-semibold text-bear mb-2 text-xs uppercase tracking-wide">Bearish ({signal.bearishFactors?.length ?? 0})</h4>
          <ul className="space-y-1 text-xs">
            {(signal.bearishFactors ?? []).map((r: string, i: number) => <li key={i}>• {r}</li>)}
            {(!signal.bearishFactors || signal.bearishFactors.length === 0) && <li className="text-muted-foreground">Tidak ada faktor bearish dominan.</li>}
          </ul>
        </div>
      </div>

      {/* CONTEXT / NEUTRAL */}
      <div className="rounded border border-border bg-card/40 p-3">
        <h4 className="font-semibold mb-2 text-xs uppercase tracking-wide text-muted-foreground">Context & invalidations</h4>
        <ul className="grid md:grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {(signal.neutralFactors ?? []).map((r: string, i: number) => <li key={`n${i}`}>• {r}</li>)}
          {regime && (
            <>
              <li className="text-foreground">Regime: <span className="capitalize">{regime.trend}</span> · phase {regime.phase}</li>
              <li>Volatility: <span className="capitalize">{regime.volatility}</span></li>
              {regime.bestStrategy && <li className="md:col-span-2">Strategy fit: {regime.bestStrategy}</li>}
            </>
          )}
          {(signal.invalidations ?? []).map((r: string, i: number) => (
            <li key={`i${i}`} className="text-bear">⚠ {r}</li>
          ))}
        </ul>
        {signal.patterns?.length > 0 && (
          <div className="mt-3">
            <div className="text-xs text-muted-foreground mb-1">Recent patterns</div>
            <div className="flex flex-wrap gap-1">
              {signal.patterns.map((p: any, i: number) => (
                <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded ${p.bias === "bullish" ? "bg-bull-soft text-bull" : p.bias === "bearish" ? "bg-bear-soft text-bear" : "bg-accent/40"}`}>
                  {p.name}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* BEST ACTION */}
      <div className={`rounded border p-3 ${
        action.startsWith("LONG") ? "border-bull/40 bg-bull-soft/20" :
        action.startsWith("SHORT") || action.startsWith("Reduced size SHORT") ? "border-bear/40 bg-bear-soft/20" :
        action.startsWith("SKIP") ? "border-bear/30 bg-bear-soft/10" :
        "border-border bg-card/40"
      }`}>
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Best action sekarang</div>
        <div className="font-semibold">{action}</div>
        <div className="text-xs text-muted-foreground mt-1">{actionDetail}</div>
      </div>
    </div>
  );
}

function CtxCell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="panel-2 p-2">
      <div className="text-[10px] text-muted-foreground truncate">{label}</div>
      <div className="text-sm font-medium capitalize">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

function SRPanel({ zones, price, fmt }: { zones: any[]; price: number; fmt: (n: any) => string }) {
  if (!zones?.length) return <div className="text-sm text-muted-foreground">No clear S/R zones detected.</div>;
  const supports = zones.filter(z => z.kind === "support").sort((a, b) => b.price - a.price);
  const resistances = zones.filter(z => z.kind === "resistance").sort((a, b) => a.price - b.price);
  return (
    <div className="grid md:grid-cols-2 gap-4 text-sm">
      <div>
        <h4 className="font-semibold text-bear mb-2">Resistances</h4>
        <ul className="space-y-1">
          {resistances.slice(0, 6).map((z, i) => (
            <li key={i} className="flex justify-between font-mono text-xs">
              <span>{fmt(z.price)} <span className="text-muted-foreground">({fmt(z.low)}–{fmt(z.high)})</span></span>
              <span className="text-muted-foreground">str {z.strength?.toFixed?.(0) ?? "—"} · {z.touches}x</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h4 className="font-semibold text-bull mb-2">Supports</h4>
        <ul className="space-y-1">
          {supports.slice(0, 6).map((z, i) => (
            <li key={i} className="flex justify-between font-mono text-xs">
              <span>{fmt(z.price)} <span className="text-muted-foreground">({fmt(z.low)}–{fmt(z.high)})</span></span>
              <span className="text-muted-foreground">str {z.strength?.toFixed?.(0) ?? "—"} · {z.touches}x</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="md:col-span-2 text-xs text-muted-foreground">Current price: <span className="font-mono text-foreground">{fmt(price)}</span></div>
    </div>
  );
}

function TVAnalysisWidget({ symbol, interval }: { symbol: string; interval: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = "";
    const wrapper = document.createElement("div");
    wrapper.className = "tradingview-widget-container";
    const inner = document.createElement("div");
    inner.className = "tradingview-widget-container__widget";
    wrapper.appendChild(inner);
    const s = document.createElement("script");
    s.src = "https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js";
    s.async = true;
    s.innerHTML = JSON.stringify({
      interval: interval === "D" ? "1D" : interval === "W" ? "1W" : interval === "60" ? "1h" : interval === "240" ? "4h" : `${interval}m`,
      width: "100%",
      isTransparent: true,
      height: 400,
      symbol,
      showIntervalTabs: true,
      displayMode: "single",
      locale: "en",
      colorTheme: "dark",
    });
    wrapper.appendChild(s);
    ref.current.appendChild(wrapper);
    return () => { if (ref.current) ref.current.innerHTML = ""; };
  }, [symbol, interval]);
  return <div ref={ref} className="min-h-[400px]" />;
}

function SmartMoneyPanel({ symbol }: { symbol: string }) {
  const q = useQuery({
    queryKey: ["smart", symbol],
    queryFn: () => smartMoney({ data: { symbol } }),
    refetchInterval: 60_000,
  });
  if (!q.data) return <div className="text-sm text-muted-foreground">Analyzing institutional flow…</div>;
  const tone = q.data.score > 15 ? "text-bull" : q.data.score < -15 ? "text-bear" : "text-muted-foreground";
  return (
    <div className="text-sm space-y-2">
      <div className="flex items-center gap-3">
        <div className={`text-base font-semibold ${tone}`}>{q.data.label}</div>
        <div className="text-xs text-muted-foreground">flow: {q.data.flow} · score {q.data.score}</div>
      </div>
      <ul className="text-xs text-muted-foreground space-y-1">
        {q.data.details.map((d: string, i: number) => <li key={i}>• {d}</li>)}
      </ul>
      <p className="text-[11px] text-muted-foreground">Heuristik dari price-volume, bukan order flow nyata.</p>
    </div>
  );
}

function SentimentPanel({ symbol }: { symbol: string }) {
  const q = useQuery({
    queryKey: ["sent", symbol],
    queryFn: () => newsSentiment({ data: { symbol } }),
    refetchInterval: 5 * 60_000,
  });
  if (!q.data) return null;
  const d = q.data;
  const tone = d.score > 25 ? "text-bull" : d.score < -25 ? "text-bear" : "text-muted-foreground";
  const relevant = (d.items ?? []).filter((n: any) => n.relevanceBand === "High" || n.relevanceBand === "Medium");
  const display = relevant.length ? relevant : (d.items ?? []);
  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">News Sentiment</h3>
        <span className={`text-sm font-semibold ${tone}`}>{d.label}{d.relevantCount > 0 && ` · ${d.score}`}</span>
      </div>
      <div className="text-[11px] text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
        <span>Confidence: <span className="text-foreground">{d.confidence}%</span></span>
        <span>News: <span className="text-foreground">{d.newsCount}</span></span>
        <span>Relevant: <span className="text-foreground">{d.relevantCount}</span></span>
        <span>Quality: <span className="text-foreground">{d.relevanceQuality}</span></span>
      </div>
      {d.relevantCount === 0 && (
        <div className="mt-2 text-xs text-muted-foreground">
          No highly relevant news found for this symbol.
        </div>
      )}
      <ul className="mt-2 text-xs space-y-1 max-h-48 overflow-auto">
        {display.slice(0, 6).map((n: any, i: number) => (
          <li key={i} className="flex gap-2 items-start">
            <span className={n.sentiment === "positive" ? "text-bull" : n.sentiment === "negative" ? "text-bear" : "text-muted-foreground"}>●</span>
            <a href={n.link} target="_blank" rel="noreferrer" className="hover:text-foreground line-clamp-2 flex-1">{n.title}</a>
            <span className="text-[9px] uppercase text-muted-foreground/70 shrink-0">{n.relevanceBand}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PaperTrade({ symbol, price, fmt, bias, signalLabel }: {
  symbol: string; price: number; fmt: (n: any) => string;
  bias?: "long" | "short" | "neutral";
  signalLabel?: string;
}) {
  const [qty, setQty] = useState(10);
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState<"market" | "limit" | "stop" | "trailing_stop">("market");
  const [limitPx, setLimitPx] = useState<string>("");
  const [stopPx, setStopPx] = useState<string>("");
  const [trailPct, setTrailPct] = useState<string>("3");
  const [tp, setTp] = useState<string>("");
  const [sl, setSl] = useState<string>("");

  const isHold = bias === "neutral" || signalLabel === "HOLD";
  const isShort = bias === "short";
  const primarySide: "buy" | "sell" = isShort ? "sell" : "buy";
  const primaryLabel = isHold
    ? "No Trade"
    : isShort ? "Execute SHORT" : "Execute LONG";
  const primaryClass = isShort
    ? "bg-bear text-primary-foreground hover:opacity-90"
    : "bg-bull text-primary-foreground hover:opacity-90";

  const onTrade = async (side: "buy" | "sell") => {
    setBusy(true);
    try {
      if (type === "market") {
        await placeOrder({ data: {
          symbol, side, qty,
          takeProfit: tp ? Number(tp) : undefined,
          stopLoss: sl ? Number(sl) : undefined,
        } });
        toast.success(`${side.toUpperCase()} ${qty} ${symbol} filled`);
      } else {
        await placeAdvancedOrder({ data: {
          symbol, side, qty, type,
          limitPrice: type === "limit" ? Number(limitPx) : undefined,
          stopPrice: type === "stop" ? Number(stopPx) : undefined,
          trailingPct: type === "trailing_stop" ? Number(trailPct) : undefined,
          takeProfit: tp ? Number(tp) : undefined,
          stopLoss: sl ? Number(sl) : undefined,
        } });
        toast.success(`${type.toUpperCase()} ${side.toUpperCase()} ${qty} ${symbol} pending`);
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Order failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Paper Trade</h3>
        {bias && (
          <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
            isShort ? "bg-bear-soft text-bear" :
            isHold ? "bg-accent/40 text-muted-foreground" :
            "bg-bull-soft text-bull"
          }`}>{isHold ? "HOLD" : isShort ? "SHORT setup" : "LONG setup"}</span>
        )}
      </div>

      {isHold && (
        <div className="mt-2 text-xs text-muted-foreground">
          No valid trade setup. Wait for trigger confirmation.
        </div>
      )}

      <div className="mt-3 grid grid-cols-4 gap-1 text-xs">
        {(["market", "limit", "stop", "trailing_stop"] as const).map(t => (
          <button key={t} onClick={() => setType(t)}
            className={`px-2 py-1 rounded uppercase ${type === t ? "bg-primary text-primary-foreground" : "bg-accent/40 hover:bg-accent/60"}`}>
            {t === "trailing_stop" ? "trail" : t}
          </button>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] text-muted-foreground">Qty</label>
          <Input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, parseInt(e.target.value || "1")))} />
        </div>
        {type === "limit" && (
          <div>
            <label className="text-[11px] text-muted-foreground">Limit price</label>
            <Input type="number" step="any" value={limitPx} onChange={e => setLimitPx(e.target.value)} placeholder={String(price)} />
          </div>
        )}
        {type === "stop" && (
          <div>
            <label className="text-[11px] text-muted-foreground">Stop price</label>
            <Input type="number" step="any" value={stopPx} onChange={e => setStopPx(e.target.value)} placeholder={String(price)} />
          </div>
        )}
        {type === "trailing_stop" && (
          <div>
            <label className="text-[11px] text-muted-foreground">Trail %</label>
            <Input type="number" step="0.1" value={trailPct} onChange={e => setTrailPct(e.target.value)} />
          </div>
        )}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <div>
          <label className="text-[11px] text-muted-foreground">Take profit (opt)</label>
          <Input type="number" step="any" value={tp} onChange={e => setTp(e.target.value)} />
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground">Stop loss (opt)</label>
          <Input type="number" step="any" value={sl} onChange={e => setSl(e.target.value)} />
        </div>
      </div>

      <div className="mt-2 text-xs text-muted-foreground">
        Notional ≈ <span className="font-mono">{fmt(price * qty)}</span>
      </div>
      <div className="mt-3 flex gap-2">
        <Button disabled={busy || isHold}
          onClick={() => onTrade(primarySide)}
          className={`flex-1 ${primaryClass}`}>
          {primaryLabel}
        </Button>
        <Button disabled={busy} onClick={() => onTrade(isShort ? "buy" : "sell")} variant="outline" className="flex-1">
          {isShort ? "Cover / Buy" : "Close / Sell"}
        </Button>
      </div>
      <div className="mt-3 text-[11px] text-muted-foreground">
        {type === "market" ? "Slippage 0.05% · fee 0.1%." : "Pending orders evaluate every minute."} Pastikan setup, stop loss, dan risk per trade sudah sesuai.
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground/80 leading-snug">
        Analisis ini bersifat edukatif dan bukan saran finansial. Sinyal AI dapat salah, data dapat terlambat, dan kondisi market dapat berubah cepat. Selalu gunakan risk management dan lakukan riset mandiri.
      </p>
    </div>
  );
}

