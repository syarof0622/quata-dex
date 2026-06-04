import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  LineChart,
  Newspaper,
  Shield,
  Sparkles,
  TrendingUp,
  Activity,
  Layers,
  Gauge,
  History,
  ShieldCheck,
  Database,
  CircleDot,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Quanta Terminal — AI Stock Research Terminal for Smarter Paper Trading" },
      { name: "description", content: "AI-powered IDX stock research terminal: market pulse, news sentiment, portfolio risk, strategy intelligence, and autonomous paper trading in one transparent, auditable dashboard." },
      { property: "og:title", content: "Quanta Terminal — AI Stock Research Terminal" },
      { property: "og:description", content: "Research smarter. Trade safer in simulation. Paper trading only — no real-money execution." },
    ],
  }),
  component: Landing,
});

// Dark institutional palette — matches the authenticated terminal theme.
const C = {
  bg: "#0a1018",
  bg2: "#0e1622",
  surface: "#111a26",
  surfaceMuted: "#0d141d",
  border: "#1f2a3a",
  borderSoft: "#172131",
  ink: "#eaf2ff",
  inkSoft: "#c5d2e6",
  muted: "#7d8aa1",
  green: "#00ffb2",
  amber: "#f5b042",
  red: "#ef4d4d",
};

function Landing() {
  return (
    <div
      className="min-h-screen w-full relative overflow-x-hidden"
      style={{
        background: C.bg,
        color: C.ink,
        fontFamily:
          'ui-sans-serif, -apple-system, "Inter", "Helvetica Neue", system-ui, sans-serif',
      }}
    >
      {/* Layer 1: dotted grid full viewport */}
      <div
        aria-hidden
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />
      {/* Layer 2: hero radial glow (neon mint) */}
      <div
        aria-hidden
        className="absolute pointer-events-none z-0"
        style={{
          top: "-200px",
          left: "50%",
          transform: "translateX(-50%)",
          width: "1400px",
          height: "900px",
          background:
            "radial-gradient(ellipse at center, rgba(0,255,178,0.10) 0%, rgba(0,255,178,0.04) 35%, transparent 70%)",
          filter: "blur(30px)",
        }}
      />
      {/* Layer 3: soft vignette */}
      <div
        aria-hidden
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          background:
            "radial-gradient(ellipse 120% 80% at 50% 40%, transparent 50%, rgba(0,0,0,0.45) 100%)",
        }}
      />
      {/* Layer 4: subtle gradient fade top to bottom */}
      <div
        aria-hidden
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(10,16,24,0.6) 0%, transparent 30%, transparent 80%, rgba(10,16,24,0.8) 100%)",
        }}
      />

      <div className="relative z-10">
        <Nav />
        <Hero />
        <MockupSection />
        <FeatureSection />
        <AiAgentSection />
        <RiskEngineSection />
        <NewsSection />
        <SafetySection />
        <FinalCta />
        <Footer />
      </div>
    </div>
  );
}

/* ---------------- Navbar ---------------- */
function Nav() {
  return (
    <header className="w-full">
      <div
        className="max-w-[1440px] mx-auto px-6 lg:px-10 flex items-center justify-between"
        style={{ height: 68 }}
      >
        <Link to="/" className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[13px] font-bold"
            style={{ background: C.ink, color: C.bg }}
          >
            Q
          </div>
          <span className="text-[15px] font-semibold tracking-tight">
            Quanta<span style={{ color: C.muted }}>.Terminal</span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-7 text-[13.5px]" style={{ color: C.inkSoft }}>
          <a href="#features" className="hover:opacity-70 transition-opacity">Features</a>
          <a href="#ai-agent" className="hover:opacity-70 transition-opacity">AI Agent</a>
          <a href="#paper" className="hover:opacity-70 transition-opacity">Paper Trading</a>
          <a href="#intelligence" className="hover:opacity-70 transition-opacity">Intelligence</a>
          <a href="#risk" className="hover:opacity-70 transition-opacity">Risk Engine</a>
        </nav>

        <div className="flex items-center gap-3">
          <Link to="/auth" className="hidden sm:inline text-[13.5px] hover:opacity-70" style={{ color: C.inkSoft }}>
            Sign in
          </Link>
          <Link
            to="/auth"
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-medium transition-transform hover:scale-[1.02]"
            style={{ background: C.ink, color: C.bg }}
          >
            Get started
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
      <div className="w-full" style={{ borderBottom: `1px solid ${C.borderSoft}` }} />
    </header>
  );
}

/* ---------------- Hero ---------------- */
function Hero() {
  return (
    <section className="max-w-[1440px] mx-auto px-6 lg:px-10 pt-16 md:pt-24 pb-10 text-center">
      <div className="max-w-[1100px] mx-auto">
        {/* Badge */}
        <div
          className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[11px] font-medium tracking-[0.12em] uppercase"
          style={{
            background: C.surface,
            border: `1px solid ${C.border}`,
            color: C.inkSoft,
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: C.green, boxShadow: `0 0 8px ${C.green}` }}
          />
          Paper Trading Only — No Real-Money Execution
        </div>

        {/* Headline */}
        <h1
          className="mt-7 font-semibold tracking-tight"
          style={{
            fontSize: "clamp(42px, 7.5vw, 88px)",
            lineHeight: 1.02,
            letterSpacing: "-0.035em",
          }}
        >
          AI Stock Research Terminal
          <br />
          <span style={{ color: C.muted }}>for Smarter Paper Trading</span>
        </h1>

        {/* Subheadline */}
        <p
          className="mt-7 mx-auto text-[16px] md:text-[18px] leading-relaxed"
          style={{ color: C.muted, maxWidth: 720 }}
        >
          Analyze market data, news, sentiment, portfolio risk, and paper trading decisions
          inside one transparent AI research terminal — built for IDX research and simulation.
        </p>

        {/* CTAs */}
        <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to="/auth"
            className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-[14px] font-medium transition-transform hover:scale-[1.02]"
            style={{ background: C.ink, color: C.bg }}
          >
            Get started
            <ArrowRight className="w-4 h-4" />
          </Link>
          <a
            href="#mockup"
            className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-[14px] font-medium"
            style={{
              background: C.surface,
              border: `1px solid ${C.border}`,
              color: C.ink,
            }}
          >
            View demo
            <ArrowUpRight className="w-4 h-4" />
          </a>
        </div>

        {/* Trust line */}
        <div className="mt-8 flex items-center justify-center gap-6 text-[12px]" style={{ color: C.muted }}>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" /> No broker connection
          </span>
          <span className="hidden sm:inline-flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5" /> Auditable decisions
          </span>
          <span className="hidden md:inline-flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" /> IDX market focus
          </span>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Dashboard Mockup ---------------- */
function MockupSection() {
  return (
    <section id="mockup" className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 pb-24">
      <div
        className="mx-auto w-full overflow-hidden"
        style={{
          maxWidth: 1240,
          borderRadius: 28,
          background: C.surface,
          border: `1px solid ${C.border}`,
          boxShadow:
            "0 1px 0 rgba(255,255,255,0.6) inset, 0 30px 80px -30px rgba(20,18,15,0.25), 0 8px 24px -12px rgba(20,18,15,0.1)",
        }}
      >
        {/* Window chrome */}
        <div
          className="flex items-center gap-2 px-4 py-3"
          style={{ borderBottom: `1px solid ${C.borderSoft}`, background: C.surfaceMuted }}
        >
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full" style={{ background: "#ff5f57" }} />
            <span className="w-3 h-3 rounded-full" style={{ background: "#febc2e" }} />
            <span className="w-3 h-3 rounded-full" style={{ background: "#28c840" }} />
          </div>
          <div
            className="ml-4 text-[11px] font-medium px-3 py-1 rounded-md"
            style={{ background: C.bg, color: C.muted, border: `1px solid ${C.borderSoft}` }}
          >
            quanta.terminal / dashboard
          </div>
        </div>

        {/* Mockup body */}
        <div className="p-4 sm:p-6 grid grid-cols-12 gap-4">
          {/* Top row: 5 KPI cards */}
          <MockCard title="AI Trade Agent" col="col-span-12 sm:col-span-6 lg:col-span-3 xl:col-span-3">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: C.green }} />
              <span className="text-[10px] font-semibold tracking-wider uppercase" style={{ color: C.green }}>
                Auto Running
              </span>
            </div>
            <div className="text-[11px]" style={{ color: C.muted }}>Paper Trading Only</div>
            <div className="text-[18px] font-semibold mt-2">5 decisions</div>
            <div className="text-[10.5px] mt-0.5" style={{ color: C.muted }}>last decision 10:31 WIB</div>
          </MockCard>

          <MockCard title="Portfolio Risk" col="col-span-12 sm:col-span-6 lg:col-span-3">
            <div className="grid grid-cols-2 gap-y-1.5 gap-x-3 text-[11px]">
              <span style={{ color: C.muted }}>Equity</span>
              <span className="text-right font-medium">Rp 102.4M</span>
              <span style={{ color: C.muted }}>Cash buffer</span>
              <span className="text-right font-medium">38%</span>
              <span style={{ color: C.muted }}>Drawdown</span>
              <span className="text-right font-medium" style={{ color: C.red }}>−2.1%</span>
            </div>
            <RiskBar label="Risk level" value={42} />
          </MockCard>

          <MockCard title="Market Pulse" col="col-span-12 sm:col-span-6 lg:col-span-3">
            <div className="text-[11px] mb-1.5" style={{ color: C.muted }}>IDX Regime</div>
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium"
              style={{ background: "rgba(245,176,66,0.12)", color: C.amber, border: `1px solid rgba(245,176,66,0.35)` }}>
              <CircleDot className="w-3 h-3" /> Neutral
            </div>
            <div className="mt-2.5 text-[11px]" style={{ color: C.muted }}>Breadth · 54% advancers</div>
            <div className="mt-1 text-[11px]" style={{ color: C.muted }}>Rotation → Consumer, Bank</div>
          </MockCard>

          <MockCard title="News Sentiment" col="col-span-12 sm:col-span-6 lg:col-span-3">
            <SentimentDial value={0.62} />
            <div className="mt-2 text-[11px]" style={{ color: C.muted }}>3 high-impact today</div>
            <div className="text-[11px]" style={{ color: C.muted }}>Source health · partial</div>
          </MockCard>

          {/* Bottom row */}
          <MockCard title="Equity Curve" col="col-span-12 lg:col-span-5">
            <Sparkline />
            <div className="mt-2 flex items-center justify-between text-[11px]" style={{ color: C.muted }}>
              <span>30D paper P/L</span>
              <span style={{ color: C.green }} className="font-medium">+4.83%</span>
            </div>
          </MockCard>

          <MockCard title="Strategy Intelligence" col="col-span-12 sm:col-span-6 lg:col-span-3">
            <div className="text-[12px] font-medium">Momentum Mean-Revert</div>
            <div className="text-[10.5px] mt-0.5" style={{ color: C.muted }}>fits Neutral regime</div>
            <div className="grid grid-cols-2 gap-y-1 gap-x-3 mt-2 text-[11px]">
              <span style={{ color: C.muted }}>Backtest</span>
              <span className="text-right font-medium">+18.4%</span>
              <span style={{ color: C.muted }}>Forward</span>
              <span className="text-right font-medium">+6.1%</span>
              <span style={{ color: C.muted }}>Sample</span>
              <span className="text-right font-medium">good</span>
            </div>
          </MockCard>

          <MockCard title="Decision Replay" col="col-span-12 sm:col-span-6 lg:col-span-4">
            <DecisionRow ticker="CPIN.JK" intent="BUY" final="BLOCKED" reason="max active positions" tone="block" />
            <DecisionRow ticker="JPFA.JK" intent="HOLD" final="HOLDING" reason="position open" tone="hold" />
            <DecisionRow ticker="MAPI.JK" intent="WATCH" final="WATCH" reason="setup forming" tone="watch" />
          </MockCard>
        </div>
      </div>
    </section>
  );
}

function MockCard({ title, col, children }: { title: string; col: string; children: React.ReactNode }) {
  return (
    <div
      className={`${col} rounded-2xl p-4`}
      style={{ background: C.surfaceMuted, border: `1px solid ${C.borderSoft}` }}
    >
      <div className="text-[10px] font-semibold tracking-[0.14em] uppercase mb-2" style={{ color: C.muted }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function RiskBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="mt-2.5">
      <div className="flex justify-between text-[10.5px] mb-1" style={{ color: C.muted }}>
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: C.bg2 }}>
        <div
          className="h-full rounded-full"
          style={{
            width: `${value}%`,
            background: `linear-gradient(90deg, ${C.green}, ${C.amber})`,
          }}
        />
      </div>
    </div>
  );
}

function Sparkline() {
  const pts = [38, 42, 36, 44, 41, 48, 45, 52, 49, 55, 51, 58, 56, 62, 60];
  const w = 280, h = 60;
  const max = Math.max(...pts), min = Math.min(...pts);
  const d = pts
    .map((p, i) => {
      const x = (i / (pts.length - 1)) * w;
      const y = h - ((p - min) / (max - min)) * h;
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-14">
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.green} stopOpacity="0.25" />
          <stop offset="100%" stopColor={C.green} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L ${w} ${h} L 0 ${h} Z`} fill="url(#sparkFill)" />
      <path d={d} fill="none" stroke={C.green} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SentimentDial({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <div className="flex items-center gap-3">
      <div className="relative w-14 h-14">
        <svg viewBox="0 0 36 36" className="w-14 h-14 -rotate-90">
          <circle cx="18" cy="18" r="15" fill="none" stroke={C.borderSoft} strokeWidth="3" />
          <circle
            cx="18" cy="18" r="15" fill="none"
            stroke={C.green} strokeWidth="3" strokeLinecap="round"
            strokeDasharray={`${pct * 94.25} 94.25`}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-[12px] font-semibold">
          {Math.round(pct * 100)}
        </div>
      </div>
      <div className="text-[11px]" style={{ color: C.muted }}>
        Bullish<br />tone
      </div>
    </div>
  );
}

function DecisionRow({ ticker, intent, final, reason, tone }:
  { ticker: string; intent: string; final: string; reason: string; tone: "block" | "hold" | "watch" }) {
  const palette = {
    block: { bg: "rgba(239,77,77,0.12)", fg: C.red, border: "rgba(239,77,77,0.35)" },
    hold: { bg: "rgba(0,255,178,0.10)", fg: C.green, border: "rgba(0,255,178,0.30)" },
    watch: { bg: "rgba(245,176,66,0.12)", fg: C.amber, border: "rgba(245,176,66,0.35)" },
  }[tone];
  return (
    <div className="flex items-center justify-between py-1.5 text-[11px]" style={{ borderTop: `1px solid ${C.borderSoft}` }}>
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-mono font-medium">{ticker}</span>
        <span style={{ color: C.muted }}>{intent}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium"
          style={{ background: palette.bg, color: palette.fg, border: `1px solid ${palette.border}` }}>
          {final}
        </span>
        <span className="hidden sm:inline text-[10px]" style={{ color: C.muted }}>{reason}</span>
      </div>
    </div>
  );
}

/* ---------------- Feature Section ---------------- */
function FeatureSection() {
  const features = [
    { icon: Bot, title: "Autonomous AI Paper Trading", body: "AI Agent memindai market, memilih kandidat, menjalankan risk guard, dan membuat paper order secara otomatis." },
    { icon: Shield, title: "Portfolio Risk Analytics", body: "Pantau equity, cash buffer, exposure, drawdown, sector concentration, dan unrealized P/L." },
    { icon: TrendingUp, title: "Market Pulse & Sector Rotation", body: "Baca regime IDX, breadth, sector rotation, dan heatmap saham dalam satu tampilan." },
    { icon: Newspaper, title: "News & Sentiment Intelligence", body: "Berita diproses dengan sentiment, impact, source health, dan relevansi ticker." },
    { icon: Layers, title: "Strategy Intelligence", body: "Bandingkan strategi berdasarkan backtest, forward test, sample quality, dan market regime." },
    { icon: History, title: "Decision Replay & Audit Trail", body: "Lihat kenapa AI BUY, HOLD, WATCH, atau BLOCKED berdasarkan snapshot data dan risk guard." },
  ];
  return (
    <section id="features" className="max-w-[1440px] mx-auto px-6 lg:px-10 py-20 md:py-28">
      <div className="max-w-[820px] mb-12">
        <h2 className="font-semibold tracking-tight" style={{ fontSize: "clamp(28px, 4vw, 44px)", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
          Everything your AI trading workflow needs.
        </h2>
        <p className="mt-4 text-[15px] md:text-[17px]" style={{ color: C.muted }}>
          Dari market pulse sampai decision replay, Quanta Terminal membantu membaca peluang tanpa mengeksekusi dana asli.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
        {features.map((f) => (
          <div
            key={f.title}
            className="p-6 rounded-3xl transition-transform hover:-translate-y-0.5"
            style={{
              background: C.surface,
              border: `1px solid ${C.border}`,
              boxShadow: "0 1px 2px rgba(20,18,15,0.04)",
            }}
          >
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
              style={{ background: C.bg, border: `1px solid ${C.borderSoft}` }}
            >
              <f.icon className="w-4.5 h-4.5" style={{ color: C.ink, width: 18, height: 18 }} />
            </div>
            <div className="text-[15px] font-semibold mb-1.5">{f.title}</div>
            <div className="text-[13.5px] leading-relaxed" style={{ color: C.muted }}>{f.body}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------- AI Agent Section ---------------- */
function AiAgentSection() {
  const steps = [
    "Market Data", "AI Scanner", "Strategy Engine", "Risk Guard", "Paper Trade", "Learning",
  ];
  const bullets = [
    "Scan market", "Rank candidates", "Check market regime", "Validate strategy",
    "Run risk guard", "Size position", "Execute paper order", "Save decision replay",
  ];
  return (
    <section id="ai-agent" className="py-20 md:py-28" style={{ background: C.bg2, borderTop: `1px solid ${C.borderSoft}`, borderBottom: `1px solid ${C.borderSoft}` }}>
      <div className="max-w-[1440px] mx-auto px-6 lg:px-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          <div className="lg:col-span-5">
            <div className="text-[11px] uppercase tracking-[0.14em] font-semibold" style={{ color: C.muted }}>
              <Bot className="w-3.5 h-3.5 inline mr-1.5" /> AI Trade Agent
            </div>
            <h2 className="mt-3 font-semibold tracking-tight" style={{ fontSize: "clamp(28px, 4vw, 44px)", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
              Autonomous, but always auditable.
            </h2>
            <p className="mt-4 text-[15px] md:text-[16px]" style={{ color: C.muted }}>
              AI tidak asal beli. Setiap keputusan melewati scanner, strategy engine, dan risk guard —
              dan setiap keputusan punya audit trail.
            </p>
            <ul className="mt-6 grid grid-cols-2 gap-y-2 gap-x-4">
              {bullets.map((b) => (
                <li key={b} className="flex items-center gap-2 text-[13.5px]" style={{ color: C.inkSoft }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: C.green }} />
                  {b}
                </li>
              ))}
            </ul>
            <div className="mt-6 p-4 rounded-2xl text-[13px]"
              style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.inkSoft }}>
              <div className="font-medium mb-1">Transparent by default.</div>
              Every blocked decision has a reason. No broker connection. No real-money order.
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="rounded-3xl p-6 md:p-8" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
              <div className="text-[11px] uppercase tracking-[0.14em] font-semibold mb-4" style={{ color: C.muted }}>
                Decision Flow
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {steps.map((s, i) => (
                  <div key={s} className="flex items-center gap-2">
                    <div className="px-3 py-2 rounded-xl text-[12.5px] font-medium"
                      style={{ background: C.bg, border: `1px solid ${C.borderSoft}` }}>
                      {s}
                    </div>
                    {i < steps.length - 1 && <ArrowRight className="w-3.5 h-3.5" style={{ color: C.muted }} />}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
                <MiniStat label="Decisions / day" value="~ 40" />
                <MiniStat label="Avg risk guard latency" value="< 1s" />
                <MiniStat label="Audit trail retention" value="100%" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-4 rounded-2xl" style={{ background: C.surfaceMuted, border: `1px solid ${C.borderSoft}` }}>
      <div className="text-[11px] uppercase tracking-wider" style={{ color: C.muted }}>{label}</div>
      <div className="text-[20px] font-semibold mt-1 tracking-tight">{value}</div>
    </div>
  );
}

/* ---------------- Risk Engine Section ---------------- */
function RiskEngineSection() {
  const guards = [
    { icon: Layers, label: "Max Active Positions" },
    { icon: Gauge, label: "Cash Buffer" },
    { icon: TrendingUp, label: "Sector Exposure" },
    { icon: Activity, label: "Drawdown Guard" },
    { icon: LineChart, label: "Volatility Sizing" },
    { icon: Shield, label: "Stop Loss / Take Profit" },
    { icon: CircleDot, label: "Market Closed Guard" },
    { icon: Database, label: "Source/Data Quality Guard" },
  ];
  return (
    <section id="risk" className="max-w-[1440px] mx-auto px-6 lg:px-10 py-20 md:py-28">
      <div className="max-w-[820px] mb-12">
        <div className="text-[11px] uppercase tracking-[0.14em] font-semibold" style={{ color: C.muted }}>
          <Shield className="w-3.5 h-3.5 inline mr-1.5" /> Risk Engine
        </div>
        <h2 className="mt-3 font-semibold tracking-tight" style={{ fontSize: "clamp(28px, 4vw, 44px)", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
          Risk-first by design.
        </h2>
        <p className="mt-4 text-[15px] md:text-[17px]" style={{ color: C.muted }}>
          AI tidak hanya mencari saham yang naik. AI juga tahu kapan harus tidak masuk.
        </p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {guards.map((g) => (
          <div key={g.label}
            className="p-5 rounded-2xl flex flex-col gap-3"
            style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: C.bg, border: `1px solid ${C.borderSoft}` }}>
              <g.icon className="w-4 h-4" style={{ color: C.ink }} />
            </div>
            <div className="text-[13.5px] font-medium">{g.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------- News Intelligence Section ---------------- */
function NewsSection() {
  const items = [
    "Source health monitoring",
    "Ticker relevance scoring",
    "High-impact news flagging",
    "Duplicate headline filtering",
    "Sentiment + tone analysis",
    "Sector & macro context",
    "Official disclosure readiness",
  ];
  return (
    <section id="intelligence" className="py-20 md:py-28"
      style={{ background: C.bg2, borderTop: `1px solid ${C.borderSoft}`, borderBottom: `1px solid ${C.borderSoft}` }}>
      <div className="max-w-[1440px] mx-auto px-6 lg:px-10 grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        <div className="lg:col-span-5">
          <div className="text-[11px] uppercase tracking-[0.14em] font-semibold" style={{ color: C.muted }}>
            <Newspaper className="w-3.5 h-3.5 inline mr-1.5" /> News Intelligence
          </div>
          <h2 className="mt-3 font-semibold tracking-tight" style={{ fontSize: "clamp(28px, 4vw, 44px)", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
            News context, not noise.
          </h2>
          <p className="mt-4 text-[15px] md:text-[16px]" style={{ color: C.muted }}>
            Berita tidak langsung dijadikan sinyal. Sistem membedakan direct ticker catalyst,
            sector context, macro noise, dan duplicated headlines.
          </p>
        </div>
        <div className="lg:col-span-7">
          <div className="rounded-3xl p-2" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            {items.map((it, i) => (
              <div key={it}
                className="flex items-center justify-between px-5 py-3.5 text-[13.5px]"
                style={{ borderTop: i === 0 ? "none" : `1px solid ${C.borderSoft}` }}>
                <span style={{ color: C.inkSoft }}>{it}</span>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded"
                  style={{ background: "rgba(0,255,178,0.10)", color: C.green, border: `1px solid rgba(0,255,178,0.30)` }}>
                  active
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Safety Section ---------------- */
function SafetySection() {
  return (
    <section id="paper" className="max-w-[1440px] mx-auto px-6 lg:px-10 py-20 md:py-28">
      <div
        className="relative rounded-3xl p-8 md:p-12 grid grid-cols-1 md:grid-cols-12 gap-8 items-center overflow-hidden animate-fade-in"
        style={{
          background: `linear-gradient(135deg, ${C.surface} 0%, ${C.bg} 100%)`,
          border: `1px solid rgba(245,176,66,0.25)`,
          boxShadow: "0 30px 80px -40px rgba(245,176,66,0.25)",
        }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-24 w-[420px] h-[420px] rounded-full blur-3xl opacity-30"
          style={{ background: "radial-gradient(closest-side, rgba(245,176,66,0.45), transparent 70%)" }}
        />
        <div className="md:col-span-2 flex md:justify-center relative">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center animate-scale-in"
            style={{ background: "rgba(245,176,66,0.12)", border: `1px solid rgba(245,176,66,0.35)` }}>
            <ShieldCheck className="w-6 h-6" style={{ color: C.amber }} />
          </div>
        </div>
        <div className="md:col-span-10 relative">
          <h2 className="font-semibold tracking-tight" style={{ color: C.ink, fontSize: "clamp(24px, 3vw, 34px)", letterSpacing: "-0.02em", lineHeight: 1.15 }}>
            Built for simulation. Not real-money execution.
          </h2>
          <p className="mt-3 text-[15px] md:text-[16px]" style={{ color: C.inkSoft }}>
            Quanta Terminal membantu riset dan simulasi. Semua keputusan AI dijalankan dalam
            paper trading environment.
          </p>
          <ul className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6 text-[13.5px]" style={{ color: C.inkSoft }}>
            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full" style={{ background: C.amber }} /> Tidak terhubung ke broker</li>
            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full" style={{ background: C.amber }} /> Tidak mengeksekusi order sekuritas</li>
            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full" style={{ background: C.amber }} /> Semua order adalah paper trading</li>
            <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full" style={{ background: C.amber }} /> Cocok untuk riset & evaluasi strategi</li>
          </ul>
          <p className="mt-4 text-[12.5px]" style={{ color: C.muted }}>
            Keputusan investasi riil tetap tanggung jawab pengguna.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Final CTA ---------------- */
function FinalCta() {
  return (
    <section className="max-w-[1440px] mx-auto px-6 lg:px-10 pb-24">
      <div className="text-center max-w-[760px] mx-auto py-10">
        <h2 className="font-semibold tracking-tight" style={{ fontSize: "clamp(32px, 5vw, 56px)", letterSpacing: "-0.025em", lineHeight: 1.05 }}>
          Start researching smarter.
        </h2>
        <p className="mt-5 text-[16px] md:text-[18px]" style={{ color: C.muted }}>
          Bangun workflow trading yang lebih disiplin dengan AI, risk guard, dan paper trading yang bisa diaudit.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link to="/auth"
            className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-[14px] font-medium transition-transform hover:scale-[1.02]"
            style={{ background: C.ink, color: C.bg }}>
            Get started <ArrowRight className="w-4 h-4" />
          </Link>
          <Link to="/auth"
            className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-[14px] font-medium"
            style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.ink }}>
            Sign in
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Footer ---------------- */
function Footer() {
  return (
    <footer style={{ borderTop: `1px solid ${C.borderSoft}`, background: C.bg2 }}>
      <div className="max-w-[1440px] mx-auto px-6 lg:px-10 py-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[12px] font-bold"
              style={{ background: C.ink, color: C.bg }}>Q</div>
            <span className="text-[14px] font-semibold tracking-tight">
              Quanta<span style={{ color: C.muted }}>.Terminal</span>
            </span>
          </div>
          <div className="mt-2 text-[12.5px]" style={{ color: C.muted }}>
            AI Stock Research & Paper Trading Terminal · Paper Trading Only
          </div>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-[13px]" style={{ color: C.inkSoft }}>
          <a href="#features" className="hover:opacity-70">Features</a>
          <a href="#ai-agent" className="hover:opacity-70">AI Agent</a>
          <a href="#paper" className="hover:opacity-70">Paper Trading</a>
          <a href="#risk" className="hover:opacity-70">Risk Engine</a>
          <Link to="/auth" className="hover:opacity-70">Sign in</Link>
        </nav>
      </div>
    </footer>
  );
}
