import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getPaperAccount } from "@/lib/paper.functions";
import { formatIDRCompact, formatTimeWIB } from "@/lib/format";
import { useEffect, useRef, useState } from "react";
import { getQuote, getQuoteRealtime } from "@/lib/market.functions";
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
import { ingestTickerSerpApi, getTickerSentiment } from "@/lib/news.functions";
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
  "5": "5-Menit", "15": "15-Menit", "60": "1-Jam", "240": "4-Jam", D: "Harian", W: "Mingguan",
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
  const qc = useQueryClient();
  const paper = useQuery({ queryKey: ["paper"], queryFn: () => getPaperAccount(), refetchInterval: 8000 });
  const [tf, setTf] = useState<(typeof TFS)[number]>("15");
  const containerRef = useRef<HTMLDivElement>(null);
  const yfTf = tfToYf(tf);
  const isIDX = symbolMarket(symbol) === "idx";
  const isMobile = useIsMobile();
  const [panelOpen, setPanelOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const saved = window.localStorage.getItem("chart.panelOpen");
    return saved == null ? true : saved === "1";
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("chart.panelOpen", panelOpen ? "1" : "0");
    }
  }, [panelOpen]);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);

  // Realtime data provider toggle (Twelve Data) — persisted per browser.
  const [realtime, setRealtime] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("chart.realtime") === "1";
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("chart.realtime", realtime ? "1" : "0");
    }
  }, [realtime]);

  // Refresh cadence scales with selected timeframe so all panels stay synced
  // with the latest tick. Intraday → fast polling, daily/weekly → slower.
  const isIntraday = ["5", "15", "60", "240"].includes(tf);
  const quoteInterval = realtime ? 2_000 : isIntraday ? 3_000 : 10_000;
  const signalInterval = isIntraday ? 15_000 : 60_000;
  const srInterval = isIntraday ? 60_000 : 5 * 60_000;

  const quote = useQuery({
    queryKey: ["quote", symbol, realtime ? "td" : "yf"],
    queryFn: () => realtime
      ? getQuoteRealtime({ data: { symbol, provider: "twelvedata" } })
      : getQuote({ data: { symbol } }),
    refetchInterval: quoteInterval,
    refetchIntervalInBackground: false,
  });
  const advSignal = useQuery({
    queryKey: ["advsignal", symbol, yfTf],
    queryFn: () => getAdvancedSignal({ data: { symbol, timeframe: yfTf, mtf: true } }),
    refetchInterval: signalInterval,
  });
  const setup = useQuery({
    queryKey: ["setup", symbol, yfTf],
    queryFn: () => getTradeSetup({ data: { symbol, timeframe: yfTf } }),
    refetchInterval: signalInterval,
  });
  const sr = useQuery({
    queryKey: ["sr", symbol, yfTf],
    queryFn: () => getSupportResistance({ data: { symbol, timeframe: yfTf } }),
    refetchInterval: srInterval,
  });
  const regime = useQuery({
    queryKey: ["regime", symbol, yfTf],
    queryFn: () => getMarketRegime({ data: { symbol, timeframe: yfTf } }),
    refetchInterval: srInterval,
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

  const rightPanelContent = (
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
          Sinyal dihitung berdasarkan timeframe yang dipilih.
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Market Bias</span>
          <span className={`inline-flex px-2.5 py-1 rounded-md font-semibold text-sm ${sigColor}`}>
            {labelDisplay}
          </span>
        </div>
        {sig?.executionStatus && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Execution</span>
            <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-medium ${
              sig.executionStatus === "Ready to Trade" ? "bg-bull-soft text-bull" :
              sig.executionStatus === "No Trade" ? "bg-accent/40 text-muted-foreground" :
              "bg-yellow-500/20 text-yellow-500"
            }`}>{sig.executionStatus}</span>
            {sig.executionReason && (
              <span className="text-[11px] text-muted-foreground basis-full">{sig.executionReason}</span>
            )}
          </div>
        )}
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <Stat label="Kepercayaan" value={sig?.confidence ?? legacy.data?.confidence} suffix="%"
            hint={sig?.confidenceLabel} tip="How much the model trusts this signal: blends factor agreement, signal magnitude, volatility and data quality." />
          <Stat label="AI Score" value={sig?.score ?? legacy.data?.score}
            tip="Composite directional score from -100 (strong sell) to +100 (strong buy)." />
          <Stat label="Risiko" value={sig?.risk} hint={sig?.riskLabel}
            tip="0–30 Low · 31–60 Medium · 61–80 High · 81–100 Extreme. Driven by ATR%, regime volatility, choppiness and data quality." />
        </div>
        {sig && (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <Stat label="Kekuatan Trend" value={sig.trendStrength ?? "N/A"} hint={sig.trendStrengthLabel}
                tip="ADX (0–100): <20 Weak · 20–30 Developing · 30–50 Strong · 50–70 Very Strong · >70 Extreme. N/A if data insufficient." />
              <Stat label="Volatilitas" value={sig.volatilityLevel} tip="ATR% bucket — low / medium / high." />
              <Stat label="Prob. Kelanjutan" value={sig.probContinuation} suffix="%"
                tip="Heuristic chance the current move continues over the next bars." />
              <Stat label="Prob. Pembalikan" value={sig.probReversal} suffix="%"
                tip="Heuristic chance of a reversal — complement of continuation." />
            </div>
            <div className="mt-3 grid grid-cols-5 gap-1 text-[10px]">
              {Object.entries(sig.factors).map(([k, v]) => (
                <FactorBar key={k} label={k} value={v as number} />
              ))}
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              Gaya: <span className="text-foreground capitalize">{sig.recommendedStyle}</span> · Regime:{" "}
              <span className="text-foreground capitalize">{sig.regime.trend}/{sig.regime.phase}</span>
            </div>
            {sig.invalidations.length > 0 && (
              <div className="mt-3 text-xs">
                <div className="flex items-center gap-1 text-bear mb-1"><ShieldAlert className="size-3" /> Invalidasi</div>
                <ul className="space-y-1 text-muted-foreground">
                  {sig.invalidations.map((r, i) => <li key={i}>• {r}</li>)}
                </ul>
              </div>
            )}
            {sig.dataQuality !== "high" && (
              <div className="mt-3 text-[11px] text-muted-foreground border-t border-border pt-2">
                Kepercayaan sinyal dikurangi karena {sig.dataQuality === "low" ? "rendah" : "terbatas"}-kualitas data.
              </div>
            )}
          </>
        )}
        {!sig && legacy.data?.reasons && (
          <div className="mt-3">
            <div className="text-xs text-muted-foreground mb-1">Alasan</div>
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
        conditional={!!setup.data?.setup?.conditional}
        qualityGrade={setup.data?.setup?.quality?.grade}
        executionStatus={sig?.executionStatus}
        executionReason={sig?.executionReason}
        cash={Number(paper.data?.account?.cash ?? 0)}
        unrealizedPnl={Number((paper.data as any)?.pnl?.unrealized ?? 0)}
        realizedPnl={Number((paper.data as any)?.pnl?.realized ?? 0)}
        position={(paper.data?.positions ?? []).find((p: any) => p.symbol === symbol) as any}
        onTraded={() => { qc.invalidateQueries({ queryKey: ["paper"] }); }}
      />
    </div>
  );

  const showDesktopPanel = !isMobile && panelOpen;

  return (
    <div className={`grid grid-cols-1 ${showDesktopPanel ? "xl:grid-cols-[1fr_380px]" : "xl:grid-cols-1"} gap-3 p-3 transition-[grid-template-columns] duration-300`}>
      <div className="space-y-3 min-w-0">
        {/* Header */}
        <div className="panel p-4 flex flex-wrap items-center gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Button
                size="sm"
                variant={realtime ? "default" : "outline"}
                className="h-6 text-[10px] px-2"
                onClick={() => setRealtime(r => !r)}
                title="Gunakan data realtime via Twelve Data"
              >
                <Zap className="size-3 mr-1" />
                {realtime ? "Realtime: ON" : "Realtime: OFF"}
              </Button>
              {realtime && <span className="text-[10px] text-bull">Twelve Data</span>}
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              {quote.data?.exchange ?? (isIDX ? "IDX" : "—")}
              {quote.data?.marketState && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide ${
                  quote.data.marketState === "REGULAR" ? "bg-bull-soft text-bull" :
                  quote.data.marketState === "CLOSED" ? "bg-muted text-muted-foreground" :
                  "bg-accent/40 text-foreground"
                }`}>{quote.data.marketState === "REGULAR" ? "LIVE" : quote.data.marketState}</span>
              )}
              {isIDX && !realtime && <span className="text-[10px] text-amber-400">~15m delay</span>}
              {isIDX && realtime && <span className="text-[10px] text-bull">~realtime</span>}
            </div>
            <div className="text-2xl font-semibold">{symbol}</div>
            <div className="text-xs text-muted-foreground">{quote.data?.shortName ?? ""}</div>
          </div>
          <div className="ml-auto flex items-end gap-6">
            <div className="text-right">
              <div className="font-mono text-3xl flex items-center justify-end gap-2">
                {fmt(quote.data?.price)}
                {quote.isFetching && <span className="size-1.5 rounded-full bg-bull animate-pulse" title="Updating…" />}
              </div>
              <div className={`font-mono text-sm ${colorForChange(quote.data?.changePercent)}`}>
                {fmt(quote.data?.change)} · {formatPct(quote.data?.changePercent)} <span className="text-muted-foreground">{priceCurrency(symbol)}</span>
              </div>
              {quote.dataUpdatedAt > 0 && (
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  Updated {formatTimeWIB(quote.dataUpdatedAt)}
                </div>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await addToWatchlist({ data: { symbol } });
                qc.invalidateQueries({ queryKey: ["watchlist"] });
                qc.invalidateQueries({ queryKey: ["wl-rank"] });
                toast.success(`${symbol} ditambahkan ke watchlist`);
              }}
            >
              <Star className="size-4" />
            </Button>
            {isMobile ? (
              <Sheet open={mobilePanelOpen} onOpenChange={setMobilePanelOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" title="Buka panel AI">
                    <PanelRightOpen className="size-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle>Sinyal AI & Alat Trading</SheetTitle>
                  </SheetHeader>
                  <div className="mt-3">{rightPanelContent}</div>
                </SheetContent>
              </Sheet>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPanelOpen(o => !o)}
                title={panelOpen ? "Tutup panel" : "Buka panel"}
                className="hidden xl:inline-flex"
              >
                {panelOpen ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
              </Button>
            )}
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
            <TabsList className="flex-wrap h-auto gap-1">
              <TabsTrigger value="setup">Setup Trade</TabsTrigger>
              <TabsTrigger value="reasoning">Alasan AI</TabsTrigger>
              <TabsTrigger value="sr">Dukungan/Resistansi</TabsTrigger>
              <TabsTrigger value="technical">Teknikal</TabsTrigger>
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
            <TabsContent value="fundamental">
              <FundamentalPanel symbol={symbol} />
            </TabsContent>
            <TabsContent value="smart">
              <SmartMoneyPanel symbol={symbol} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Right panel — AI Signal (desktop only when expanded) */}
      {showDesktopPanel && rightPanelContent}
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
  if (!setup) return <div className="text-sm text-muted-foreground">Menghitung setup trade…</div>;
  if (setup.bias === "neutral") {
    return (
      <div className="text-sm text-muted-foreground flex items-center gap-2">
        <Zap className="size-4" /> Tidak ada setup yang bisa dieksekusi — tunggu sinyal lebih jelas.
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
            Kualitas setup: {q.grade} · {q.score}/100
          </span>
        )}
        {setup.conditional && (
          <span className="px-2 py-1 rounded text-xs font-semibold border bg-yellow-500/10 text-yellow-500 border-yellow-500/30">
            Kondisional {long ? "Long" : "Short"} — tunggu konfirmasi
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          Risiko per trade: <span className="text-foreground">{setup.riskPerTradePct}%</span> · Alokasi disarankan:{" "}
          <span className="text-foreground">{setup.suggestedAllocationPct}%</span>
        </span>
      </div>

      {Array.isArray((setup as any).riskDrivers) && (setup as any).riskDrivers.length > 0 && (
        <div className="rounded border border-border bg-card/40 p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Risk drivers</div>
          <ul className="text-xs space-y-0.5">
            {(setup as any).riskDrivers.map((d: string, i: number) => (
              <li key={i} className="text-muted-foreground">• {d}</li>
            ))}
          </ul>
        </div>
      )}

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
  const invalid = price === "—" || price === "N/A";
  return (
    <div className="panel-2 p-3">
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><Target className="size-3" /> {label}</span>
        <span>RR {rr ?? "—"}</span>
      </div>
      <div className={`font-mono text-base ${invalid ? "text-muted-foreground" : "text-bull"}`}>
        {invalid ? "N/A" : price}
      </div>
      {invalid && <div className="text-[10px] text-muted-foreground">Invalid extension</div>}
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

  // ---- WHY (professional microcopy) ----
  const biasWord = long ? "bullish" : short ? "bearish" : "neutral";
  const execStatus = signal.executionStatus ?? (hold ? "No Trade" : "Wait for Confirmation");
  const execReady = execStatus === "Ready to Trade";
  const headline = hold
    ? `${symbol} shows no clear directional bias — wait for setup.`
    : execReady
      ? `${symbol} shows ${biasWord} market bias with a valid execution trigger.`
      : `${symbol} shows ${biasWord} market bias, but execution remains conditional.`;

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
  } else if (!execReady) {
    action = `${execStatus}`;
    actionDetail = signal.executionReason || "Tunggu konfirmasi sebelum entry agresif.";
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

  // ---- Decision Summary ----
  const trigger = signal.extendedRally
    ? "Breakout with volume or pullback to EMA20/EMA50"
    : signal.regime?.phase === "ranging" ? "Breakout from range with volume"
    : long ? "Pullback to support / EMA20" : short ? "Bounce to resistance / EMA20" : "Wait for clearer signal";
  const decision = {
    bias: hold ? "Neutral" : long ? "Bullish" : "Bearish",
    execution: execStatus,
    strategy: signal.extendedRally ? "Buy on pullback (avoid chasing)" : execReady ? (long ? "Long with confirmation" : "Short with confirmation") : "Wait & set alert",
    risk: signal.riskLabel,
    avoid: signal.extendedRally ? "Chasing after sharp rally" : signal.rebound?.active ? "Trading against the counter-move" : "Oversizing in low-conviction setup",
    trigger,
  };

  return (
    <div className="space-y-4 text-sm">
      {/* WHY */}
      <div className="rounded border border-border bg-card/40 p-3 space-y-2">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Why this signal</div>
        <div className="text-foreground font-medium">{headline}</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1 text-xs">
          <div><span className="text-muted-foreground">Bias Pasar:</span> <span className="font-medium">{label}</span></div>
          <div><span className="text-muted-foreground">Execution:</span> <span className="font-medium">{execStatus}</span></div>
          <div><span className="text-muted-foreground">Kepercayaan:</span> <span className="font-medium">{signal.confidence ?? 0}/100</span></div>
          {signal.trendStrength != null
            ? <div><span className="text-muted-foreground">ADX:</span> <span className="font-medium">{Math.round(signal.trendStrength)}</span></div>
            : <div><span className="text-muted-foreground">ADX:</span> <span className="font-medium">N/A</span></div>}
          {typeof signal.dailyChangePct === "number" && (
            <div><span className="text-muted-foreground">Today:</span> <span className={`font-medium ${signal.dailyChangePct > 0 ? "text-bull" : signal.dailyChangePct < 0 ? "text-bear" : ""}`}>{signal.dailyChangePct > 0 ? "+" : ""}{signal.dailyChangePct}%</span></div>
          )}
          {signal.dataQuality && <div><span className="text-muted-foreground">Data:</span> <span className="font-medium capitalize">{signal.dataQuality}</span></div>}
        </div>
        {signal.executionReason && (
          <div className="text-[11px] text-muted-foreground border-t border-border pt-2">{signal.executionReason}</div>
        )}
        {mctx?.summary && <div className="text-[11px] text-muted-foreground">{mctx.summary}</div>}
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
            <CtxCell label="Kekuatan rel. vs indeks" value={mctx.relativeStrength.vsBenchmark != null ? `${mctx.relativeStrength.vsBenchmark > 0 ? "+" : ""}${mctx.relativeStrength.vsBenchmark}%` : "—"} sub={mctx.relativeStrength.vsBenchmark != null && mctx.relativeStrength.vsBenchmark > 0 ? "outperforming" : mctx.relativeStrength.vsBenchmark != null ? "underperforming" : ""} />
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
              <li>Volatilitas: <span className="capitalize">{regime.volatility}</span></li>
              {regime.bestStrategy && <li className="md:col-span-2">Cocok untuk strategi: {regime.bestStrategy}</li>}
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

      {/* DECISION SUMMARY */}
      <div className="rounded border border-primary/30 bg-primary/5 p-3">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Decision Summary</div>
        <ul className="text-xs grid md:grid-cols-2 gap-x-4 gap-y-1">
          <li><span className="text-muted-foreground">Bias:</span> <span className="font-medium">{decision.bias}</span></li>
          <li><span className="text-muted-foreground">Execution:</span> <span className="font-medium">{decision.execution}</span></li>
          <li><span className="text-muted-foreground">Strategi Terbaik:</span> <span className="font-medium">{decision.strategy}</span></li>
          <li><span className="text-muted-foreground">Risk:</span> <span className="font-medium">{decision.risk}</span></li>
          <li className="md:col-span-2"><span className="text-muted-foreground">Hindari:</span> <span className="font-medium">{decision.avoid}</span></li>
          <li className="md:col-span-2"><span className="text-muted-foreground">Pemicu:</span> <span className="font-medium">{decision.trigger}</span></li>
        </ul>
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
  if (!zones?.length) return <div className="text-sm text-muted-foreground">Tidak ada zona S/R yang terdeteksi.</div>;
  const supports = zones.filter(z => z.kind === "support").sort((a, b) => b.price - a.price);
  const resistances = zones.filter(z => z.kind === "resistance").sort((a, b) => a.price - b.price);
  return (
    <div className="grid md:grid-cols-2 gap-4 text-sm">
      <div>
        <h4 className="font-semibold text-bear mb-2">Resistansi</h4>
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
        <h4 className="font-semibold text-bull mb-2">Dukungan</h4>
        <ul className="space-y-1">
          {supports.slice(0, 6).map((z, i) => (
            <li key={i} className="flex justify-between font-mono text-xs">
              <span>{fmt(z.price)} <span className="text-muted-foreground">({fmt(z.low)}–{fmt(z.high)})</span></span>
              <span className="text-muted-foreground">str {z.strength?.toFixed?.(0) ?? "—"} · {z.touches}x</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="md:col-span-2 text-xs text-muted-foreground">Harga saat ini: <span className="font-mono text-foreground">{fmt(price)}</span></div>
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
  if (!q.data) return <div className="text-sm text-muted-foreground">Menganalisis aliran institusional…</div>;
  const d: any = q.data;
  const tone = d.score > 15 ? "text-bull" : d.score < -15 ? "text-bear" : "text-muted-foreground";
  const qualityBadge = d.quality === "high" ? "bg-bull-soft text-bull" : d.quality === "medium" ? "bg-accent/40" : "bg-muted/40 text-muted-foreground";
  return (
    <div className="text-sm space-y-2">
      <div className="flex items-center gap-3 flex-wrap">
        <div className={`text-base font-semibold ${tone}`}>{d.label}</div>
        <div className="text-xs text-muted-foreground">flow: {d.flow} · score {d.score}</div>
        {d.quality && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase ${qualityBadge}`}>
            confidence: {d.quality}
          </span>
        )}
      </div>
      {d.narrative && <p className="text-xs">{d.narrative}</p>}
      <ul className="text-xs text-muted-foreground space-y-1">
        {d.details.map((s: string, i: number) => <li key={i}>• {s}</li>)}
      </ul>
      <p className="text-[11px] text-muted-foreground">Heuristik dari price-volume profile (volume ratio, OBV slope, large-bar prints) — bukan order flow nyata atau insider data.</p>
    </div>
  );
}

function SentimentPanel({ symbol }: { symbol: string }) {
  const [tab, setTab] = useState<"relevant" | "general" | "sources">("relevant");
  const isIDX = symbol.toUpperCase().endsWith(".JK");

  // Trigger SerpApi enrichment for this ticker (cached 30m). Silent fail if no key/quota.
  useQuery({
    queryKey: ["serpapi-ingest", symbol],
    queryFn: () => ingestTickerSerpApi({ data: { symbol } }),
    enabled: isIDX,
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  // DB-backed ticker sentiment summary (24h aggregation across all sources incl SerpApi)
  const dbSent = useQuery({
    queryKey: ["ticker-sent-db", symbol],
    queryFn: () => getTickerSentiment({ data: { symbol } }),
    enabled: isIDX,
    refetchInterval: 2 * 60_000,
  });

  const q = useQuery({
    queryKey: ["sent", symbol],
    queryFn: () => newsSentiment({ data: { symbol } }),
    refetchInterval: 5 * 60_000,
  });
  if (!q.data) return null;
  const d: any = q.data;
  const hasScore = typeof d.score === "number";
  const tone = !hasScore ? "text-muted-foreground" : d.score > 25 ? "text-bull" : d.score < -25 ? "text-bear" : "text-muted-foreground";
  const updated = d.lastUpdated ? new Date(d.lastUpdated) : null;
  const updatedLabel = updated ? `${Math.max(0, Math.round((Date.now() - updated.getTime()) / 60000))}m ago` : "";

  const renderItem = (n: any, i: number) => (
    <li key={i} className="flex gap-2 items-start">
      <span className={n.sentiment === "positive" ? "text-bull" : n.sentiment === "negative" ? "text-bear" : "text-muted-foreground"}>●</span>
      <a href={n.link} target="_blank" rel="noreferrer" className="hover:text-foreground line-clamp-2 flex-1">{n.title}</a>
      <span className="text-[9px] uppercase text-muted-foreground/70 shrink-0">{n.relevanceBand}</span>
    </li>
  );

  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">Sentimen Berita</h3>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${tone}`}>
            {d.label}{hasScore && d.relevantCount > 0 ? ` · ${d.score}` : ""}
          </span>
          <button
            onClick={() => q.refetch()}
            disabled={q.isFetching}
            className="text-[10px] px-2 py-0.5 rounded border border-border hover:bg-accent/40 disabled:opacity-50"
            title="Refresh news"
          >
            {q.isFetching ? "…" : "Perbarui"}
          </button>
        </div>
      </div>
      <div className="text-[11px] text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
        <span>Kepercayaan: <span className="text-foreground">{d.confidence}%</span></span>
        <span>Berita: <span className="text-foreground">{d.newsCount}</span></span>
        <span>Relevan: <span className="text-foreground">{d.relevantCount}</span></span>
        <span>Kualitas: <span className="text-foreground">{d.relevanceQuality}</span></span>
        {updated && <span>Diperbarui: <span className="text-foreground">{updatedLabel}</span></span>}
      </div>

      {dbSent.data && (
        <div className="mt-2 p-2 rounded bg-accent/20 border border-border/50 text-[11px] space-y-0.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-foreground">Agregat 24j (multi-sumber)</span>
            <span className={
              (dbSent.data as any).average_sentiment_score > 0.15 ? "text-bull" :
              (dbSent.data as any).average_sentiment_score < -0.15 ? "text-bear" : "text-muted-foreground"
            }>
              avg {Number((dbSent.data as any).average_sentiment_score).toFixed(2)}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
            <span className="text-bull">+{(dbSent.data as any).positive_count}</span>
            <span>={(dbSent.data as any).neutral_count}</span>
            <span className="text-bear">−{(dbSent.data as any).negative_count}</span>
            <span>Dampak tinggi: <span className="text-foreground">{(dbSent.data as any).high_impact_news_count}</span></span>
          </div>
        </div>
      )}

      {(d.notes ?? []).length > 0 && (
        <div className="mt-2 text-xs text-yellow-500/90 space-y-0.5">
          {d.notes.map((n: string, i: number) => <div key={i}>• {n}</div>)}
        </div>
      )}

      <div className="mt-3 flex gap-1 text-[11px]">
        {([
          ["relevant", `Relevan (${d.relevantCount ?? 0})`],
          ["general", `Umum (${d.generalCount ?? 0})`],
          ["sources", `Sumber (${(d.sourceBreakdown ?? []).length})`],
        ] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-2 py-1 rounded ${tab === k ? "bg-primary text-primary-foreground" : "bg-accent/40 hover:bg-accent/60"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "relevant" && (
        <ul className="mt-2 text-xs space-y-1 max-h-48 overflow-auto">
          {(d.relevant ?? []).length === 0 ? (
            <li className="text-muted-foreground">Tidak ada berita yang sangat relevan untuk {symbol}.</li>
          ) : (
            (d.relevant ?? []).slice(0, 8).map(renderItem)
          )}
        </ul>
      )}
      {tab === "general" && (
        <ul className="mt-2 text-xs space-y-1 max-h-48 overflow-auto">
          {(d.general ?? []).length === 0 ? (
            <li className="text-muted-foreground">Tidak ada berita pasar umum untuk konteks.</li>
          ) : (
            (d.general ?? []).slice(0, 8).map(renderItem)
          )}
          <li className="text-[10px] text-muted-foreground/70 pt-1">Berita umum/tidak relevan tidak mempengaruhi skor sentimen.</li>
        </ul>
      )}
      {tab === "sources" && (
        <ul className="mt-2 text-xs space-y-1 max-h-48 overflow-auto">
          {(d.sourceBreakdown ?? []).length === 0 ? (
            <li className="text-muted-foreground">Tidak ada rincian sumber tersedia.</li>
          ) : (
            (d.sourceBreakdown ?? []).map((s: any, i: number) => (
              <li key={i} className="flex justify-between gap-2 border-b border-border/30 pb-1">
                <span className="text-foreground truncate">{s.publisher}</span>
                <span className="text-muted-foreground shrink-0">
                  {s.count} · <span className="text-bull">{s.pos}+</span> <span className="text-bear">{s.neg}-</span> <span>{s.neu}=</span>
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

function PaperTrade({ symbol, price, fmt, bias, signalLabel, conditional, qualityGrade, executionStatus, executionReason, cash, unrealizedPnl, realizedPnl, position, onTraded }: {
  symbol: string; price: number; fmt: (n: any) => string;
  bias?: "long" | "short" | "neutral";
  signalLabel?: string;
  conditional?: boolean;
  qualityGrade?: "Excellent" | "Good" | "Fair" | "Poor";
  executionStatus?: "Ready to Trade" | "Wait for Pullback" | "Wait for Breakout" | "Wait for Confirmation" | "No Trade";
  executionReason?: string;
  cash?: number;
  unrealizedPnl?: number;
  realizedPnl?: number;
  position?: { qty?: number; avg_price?: number; pnl?: number; pnlPct?: number } | null;
  onTraded?: () => void;
}) {
  const [qty, setQty] = useState(symbol.endsWith(".JK") ? 100 : 10);
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState<"market" | "limit" | "stop" | "trailing_stop">("market");
  const [limitPx, setLimitPx] = useState<string>("");
  const [stopPx, setStopPx] = useState<string>("");
  const [trailPct, setTrailPct] = useState<string>("3");
  const [tp, setTp] = useState<string>("");
  const [sl, setSl] = useState<string>("");

  const isHold = bias === "neutral" || signalLabel === "HOLD";
  const isShort = bias === "short";
  const setupActive = executionStatus === "Ready to Trade" && !conditional && qualityGrade !== "Poor";
  const hasPosition = !!position && Number(position.qty ?? 0) > 0;
  const positionPnl = Number(position?.pnl ?? 0);
  const blocked = !isHold && !setupActive;

  // Badge — open position takes precedence over signal-driven NO TRADE
  const badge = hasPosition
    ? {
        text: positionPnl >= 0 ? "POSITION • PROFIT" : "POSITION • LOSS",
        cls: positionPnl >= 0 ? "bg-bull-soft text-bull" : "bg-bear-soft text-bear",
      }
    : isHold
      ? { text: "NO TRADE", cls: "bg-accent/40 text-muted-foreground" }
      : !setupActive
        ? { text: "WAIT", cls: "bg-yellow-500/20 text-yellow-500" }
        : isShort
          ? { text: "SHORT READY", cls: "bg-bear-soft text-bear" }
          : { text: "LONG READY", cls: "bg-bull-soft text-bull" };

  const primarySide: "buy" | "sell" = isShort ? "sell" : "buy";
  const primaryLabel = isHold
    ? "No Trade"
    : !setupActive
      ? "Pasang Alert"
      : isShort ? "Execute SHORT" : "Execute LONG";
  const primaryClass = !setupActive
    ? "bg-accent/40 text-foreground hover:bg-accent/60 border border-border"
    : isShort
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
      onTraded?.();
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
        <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${badge.cls}`}>{badge.text}</span>
      </div>
      {(cash != null || unrealizedPnl != null || realizedPnl != null) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] border-b border-border pb-2">
          <span className="text-muted-foreground">Saldo: <span className="font-mono text-foreground">{formatIDRCompact(cash ?? 0)}</span></span>
          <span className="text-muted-foreground">Unrealized: <span className={`font-mono ${(unrealizedPnl ?? 0) >= 0 ? "text-bull" : "text-bear"}`}>{formatIDRCompact(unrealizedPnl ?? 0)}</span></span>
          <span className="text-muted-foreground">Realized: <span className={`font-mono ${(realizedPnl ?? 0) >= 0 ? "text-bull" : "text-bear"}`}>{formatIDRCompact(realizedPnl ?? 0)}</span></span>
        </div>
      )}

      {hasPosition && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
          <span>Posisi: <span className="font-mono text-foreground">{Number(position?.qty ?? 0)} @ {formatIDRCompact(Number(position?.avg_price ?? 0))}</span></span>
          <span>Unrealized: <span className={`font-mono ${positionPnl >= 0 ? "text-bull" : "text-bear"}`}>{formatIDRCompact(positionPnl)} ({Number(position?.pnlPct ?? 0).toFixed(2)}%)</span></span>
        </div>
      )}

      {(isHold || blocked) && !hasPosition && (
        <div className={`mt-2 text-xs ${blocked && !isHold ? "text-yellow-500" : "text-muted-foreground"}`}>
          {isHold
            ? "Tidak ada setup trade yang valid. Tunggu konfirmasi trigger."
            : `${signalLabel?.includes("BUY") ? "Bullish" : "Bearish"} bias detected, but no valid entry trigger yet.${executionReason ? ` ${executionReason}` : ""}`}
        </div>
      )}
      {hasPosition && (isHold || blocked) && (
        <div className="mt-2 text-xs text-muted-foreground">
          Posisi aktif sedang berjalan. Sinyal saat ini: {isHold ? "HOLD" : "Tunggu trigger baru"}. Kelola exit lewat TP/SL atau Close/Sell.
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
          <label className="text-[11px] text-muted-foreground">
            Qty (lembar saham){symbol.endsWith(".JK") ? ` · ${Math.max(1, Math.floor(qty / 100))} lot` : ""}
          </label>
          <Input
            type="number"
            min={1}
            step={symbol.endsWith(".JK") ? 100 : 1}
            value={qty}
            onChange={(e) => {
              const n = Math.max(1, parseInt(e.target.value || "1"));
              setQty(symbol.endsWith(".JK") ? Math.max(100, Math.round(n / 100) * 100) : n);
            }}
          />
          {symbol.endsWith(".JK") && (
            <div className="text-[10px] text-muted-foreground mt-0.5">IDX = kelipatan 100 (1 lot = 100 lembar)</div>
          )}
        </div>
        {type === "limit" && (
          <div>
            <label className="text-[11px] text-muted-foreground">Limit price (harga)</label>
            <Input type="number" step="any" value={limitPx} onChange={e => setLimitPx(e.target.value)} placeholder={String(price)} />
          </div>
        )}
        {type === "stop" && (
          <div>
            <label className="text-[11px] text-muted-foreground">Stop price (harga)</label>
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
          <label className="text-[11px] text-muted-foreground">Take profit (harga saham)</label>
          <Input type="number" step="any" value={tp} onChange={e => setTp(e.target.value)} placeholder={price ? String(price) : "harga jual target"} />
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground">Stop loss (harga saham)</label>
          <Input type="number" step="any" value={sl} onChange={e => setSl(e.target.value)} placeholder={price ? String(price) : "harga stop"} />
        </div>
      </div>

      <div className="mt-2 text-xs text-muted-foreground">
        Notional ≈ <span className="font-mono">{fmt(price * qty)}</span>
      </div>
      <div className="mt-3 flex gap-2">
        <Button disabled={busy || isHold}
          onClick={() => {
            if (!setupActive) {
              toast.message("Alert tersimpan", { description: "Kami akan memberitahu Anda saat trigger valid muncul." });
            } else {
              onTrade(primarySide);
            }
          }}
          className={`flex-1 ${primaryClass}`}>
          {primaryLabel}
        </Button>
        <Button disabled={busy} variant="outline" className="flex-1"
          onClick={() => {
            if (!setupActive && !isHold) {
              toast.success("Setup disimpan ke jurnal");
            } else {
              onTrade(isShort ? "buy" : "sell");
            }
          }}>
          {isHold ? "Close / Sell" : !setupActive ? "Simpan Setup" : isShort ? "Cover / Buy" : "Close / Sell"}
        </Button>
      </div>
      <div className="mt-3 text-[11px] text-muted-foreground">
        {type === "market" ? "Slippage 0.05% · fee 0.1%." : "Order tertunda dievaluasi setiap menit."} Pastikan setup, stop loss, dan risk per trade sudah sesuai.
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground/80 leading-snug">
        Analisis ini bersifat edukatif dan bukan saran finansial. Sinyal AI dapat salah, data dapat terlambat, dan kondisi market dapat berubah cepat. Selalu gunakan risk management dan lakukan riset mandiri.
      </p>
    </div>
  );
}

