import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, Bot, LineChart, Newspaper, Shield, Sparkles, TrendingUp, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Quanta Terminal — AI Stock Research for Smarter Paper Trading" },
      { name: "description", content: "AI-powered stock research terminal: market, news, sentiment, portfolio, risk, and paper trading in one transparent, auditable dashboard." },
      { property: "og:title", content: "Quanta Terminal — AI Stock Research Terminal" },
      { property: "og:description", content: "Analisis market, berita, sentimen, portfolio, risk, dan paper trading dalam satu dashboard AI yang transparan dan bisa diaudit." },
    ],
  }),
  component: Landing,
});

// Light cream palette scoped to this public landing page only.
// The authenticated dashboard keeps its dark institutional theme.
const C = {
  bg: "#f6f2ea",
  surface: "#ffffff",
  surfaceMuted: "#fbf8f2",
  border: "#e5dfd3",
  borderSoft: "#ece6d8",
  ink: "#15140f",
  inkSoft: "#3a372f",
  muted: "#7a7468",
  accent: "#15140f",
};

function Landing() {
  return (
    <div
      className="min-h-screen w-full"
      style={{
        background: C.bg,
        color: C.ink,
        fontFamily:
          'ui-sans-serif, -apple-system, "Inter", "Helvetica Neue", system-ui, sans-serif',
      }}
    >
      {/* Dotted grid background */}
      <div
        aria-hidden
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(${C.border} 1px, transparent 1px)`,
          backgroundSize: "22px 22px",
          maskImage:
            "radial-gradient(ellipse 90% 70% at 50% 30%, black 40%, transparent 100%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 90% 70% at 50% 30%, black 40%, transparent 100%)",
          opacity: 0.55,
        }}
      />

      <div className="relative mx-auto max-w-[1240px] px-4 sm:px-6 pt-4 pb-16">
        {/* Rounded outer container */}
        <div
          className="rounded-[28px] overflow-hidden"
          style={{
            background: C.surfaceMuted,
            border: `1px solid ${C.borderSoft}`,
            boxShadow:
              "0 1px 0 rgba(255,255,255,0.7) inset, 0 30px 60px -40px rgba(20,20,15,0.18)",
          }}
        >
          {/* ============ NAVBAR ============ */}
          <header className="flex items-center justify-between px-5 sm:px-8 h-16">
            <Link to="/" className="flex items-center gap-2.5">
              <div
                className="size-7 rounded-[8px] grid place-items-center"
                style={{ background: C.ink }}
              >
                <span className="text-[13px] font-bold" style={{ color: C.bg }}>Q</span>
              </div>
              <span className="text-[15px] font-semibold tracking-tight" style={{ color: C.ink }}>
                Quanta<span style={{ color: C.muted }}>.Terminal</span>
              </span>
            </Link>

            <nav className="hidden md:flex items-center gap-7 text-[13.5px]" style={{ color: C.inkSoft }}>
              <a href="#features" className="hover:opacity-70 transition-opacity">Features</a>
              <a href="#ai-agent" className="hover:opacity-70 transition-opacity">AI Agent</a>
              <a href="#paper-trading" className="hover:opacity-70 transition-opacity">Paper Trading</a>
            </nav>

            <div className="flex items-center gap-2">
              <Link
                to="/dashboard"
                className="hidden sm:inline-flex text-[13.5px] px-3 py-2 rounded-full hover:opacity-70 transition-opacity"
                style={{ color: C.inkSoft }}
              >
                Sign in
              </Link>
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-1.5 text-[13.5px] font-medium px-4 py-2 rounded-full transition-transform hover:scale-[1.02]"
                style={{ background: C.ink, color: C.bg }}
              >
                Get started
                <ArrowRight className="size-3.5" />
              </Link>
            </div>
          </header>

          <div style={{ height: 1, background: C.borderSoft }} />

          {/* ============ HERO ============ */}
          <section className="px-5 sm:px-8 pt-16 sm:pt-24 pb-12 sm:pb-20 text-center">
            <div
              className="inline-flex items-center gap-2 text-[11.5px] uppercase tracking-[0.14em] px-3 py-1 rounded-full mb-8"
              style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.muted }}
            >
              <span
                className="size-1.5 rounded-full inline-block"
                style={{ background: "#16a34a", boxShadow: "0 0 0 3px rgba(22,163,74,0.18)" }}
              />
              Paper trading only — no real-money execution
            </div>

            <h1
              className="mx-auto max-w-[920px] text-[40px] sm:text-[60px] lg:text-[76px] font-semibold tracking-[-0.035em]"
              style={{ color: C.ink, lineHeight: 1.02 }}
            >
              AI Stock Research Terminal
              <br />
              <span style={{ color: C.muted }}>for Smarter Paper Trading</span>
            </h1>

            <p
              className="mx-auto mt-6 max-w-[640px] text-[16px] sm:text-[17px]"
              style={{ color: C.muted, lineHeight: 1.55 }}
            >
              Analisis market, berita, sentimen, portfolio, risk, dan paper trading
              dalam satu dashboard AI yang transparan dan bisa diaudit.
            </p>

            <div className="mt-9 flex items-center justify-center gap-3 flex-wrap">
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 text-[14.5px] font-medium px-6 py-3 rounded-full transition-transform hover:scale-[1.02]"
                style={{ background: C.ink, color: C.bg }}
              >
                Get started
                <ArrowRight className="size-4" />
              </Link>
              <a
                href="#mockup"
                className="inline-flex items-center gap-2 text-[14.5px] font-medium px-6 py-3 rounded-full"
                style={{
                  background: C.surface,
                  color: C.ink,
                  border: `1px solid ${C.border}`,
                }}
              >
                View demo
                <ArrowUpRight className="size-4" />
              </a>
            </div>
          </section>

          {/* ============ PRODUCT MOCKUP ============ */}
          <section id="mockup" className="px-3 sm:px-8 pb-16 sm:pb-24">
            <div
              className="mx-auto max-w-[1080px] rounded-[20px] overflow-hidden"
              style={{
                background: C.surface,
                border: `1px solid ${C.border}`,
                boxShadow:
                  "0 1px 0 rgba(255,255,255,0.9) inset, 0 40px 80px -30px rgba(20,20,15,0.22), 0 8px 24px -12px rgba(20,20,15,0.10)",
              }}
            >
              {/* Window chrome */}
              <div
                className="flex items-center gap-2 px-4 h-9"
                style={{ background: C.surfaceMuted, borderBottom: `1px solid ${C.borderSoft}` }}
              >
                <span className="size-2.5 rounded-full" style={{ background: "#ff5f57" }} />
                <span className="size-2.5 rounded-full" style={{ background: "#febc2e" }} />
                <span className="size-2.5 rounded-full" style={{ background: "#28c840" }} />
                <div
                  className="ml-3 text-[11px] px-2.5 py-0.5 rounded-md font-mono"
                  style={{ color: C.muted, background: C.surface, border: `1px solid ${C.borderSoft}` }}
                >
                  quanta.terminal / dashboard
                </div>
              </div>

              {/* Dashboard preview */}
              <div className="p-4 sm:p-6 grid grid-cols-12 gap-3 sm:gap-4" style={{ background: C.surface }}>
                <MockCard className="col-span-12 md:col-span-7" title="AI Trade Agent" icon={<Bot className="size-3.5" />} badge={{ text: "AUTO RUNNING", tone: "bull" }}>
                  <div className="flex items-end justify-between mb-3">
                    <div>
                      <div className="text-[11px]" style={{ color: C.muted }}>Equity Curve · WIB</div>
                      <div className="text-[22px] font-semibold tracking-tight">Rp 12.847.500</div>
                    </div>
                    <div className="text-[12px] font-mono" style={{ color: "#16a34a" }}>+ 2.84%</div>
                  </div>
                  <Sparkline />
                </MockCard>

                <MockCard className="col-span-12 md:col-span-5" title="Portfolio Risk" icon={<Shield className="size-3.5" />}>
                  <RiskBar label="Concentration" value={42} />
                  <RiskBar label="Sector exposure" value={28} />
                  <RiskBar label="Drawdown" value={11} tone="ok" />
                  <RiskBar label="Liquidity" value={64} />
                </MockCard>

                <MockCard className="col-span-12 md:col-span-4" title="Market Pulse" icon={<TrendingUp className="size-3.5" />}>
                  {[
                    { sym: "BBCA", chg: "+1.24%", up: true },
                    { sym: "BBRI", chg: "+0.62%", up: true },
                    { sym: "TLKM", chg: "−0.31%", up: false },
                    { sym: "BMRI", chg: "+0.94%", up: true },
                  ].map((r) => (
                    <div key={r.sym} className="flex items-center justify-between text-[12.5px] py-1">
                      <span className="font-mono">{r.sym}.JK</span>
                      <span className="font-mono" style={{ color: r.up ? "#16a34a" : "#dc2626" }}>{r.chg}</span>
                    </div>
                  ))}
                </MockCard>

                <MockCard className="col-span-12 md:col-span-4" title="News Sentiment" icon={<Newspaper className="size-3.5" />}>
                  <SentimentDial />
                  <div className="text-[11px] text-center mt-2" style={{ color: C.muted }}>
                    24 articles · last 6h
                  </div>
                </MockCard>

                <MockCard className="col-span-12 md:col-span-4" title="Strategy Intelligence" icon={<Sparkles className="size-3.5" />}>
                  {[
                    { name: "Momentum Breakout", wr: 68 },
                    { name: "Mean Reversion", wr: 54 },
                    { name: "Trend Follow EMA", wr: 61 },
                  ].map((s) => (
                    <div key={s.name} className="flex items-center justify-between text-[12.5px] py-1">
                      <span style={{ color: C.inkSoft }}>{s.name}</span>
                      <span className="font-mono" style={{ color: C.muted }}>{s.wr}% wr</span>
                    </div>
                  ))}
                </MockCard>
              </div>
            </div>
          </section>

          {/* ============ FEATURE HIGHLIGHTS ============ */}
          <section id="features" className="px-5 sm:px-8 pb-16 sm:pb-24">
            <div className="max-w-[1080px] mx-auto">
              <div className="mb-8 sm:mb-10 text-center">
                <div className="text-[11px] uppercase tracking-[0.18em]" style={{ color: C.muted }}>
                  Built for serious research
                </div>
                <h2 className="mt-3 text-[28px] sm:text-[36px] font-semibold tracking-[-0.02em]" style={{ color: C.ink }}>
                  Everything you need in one workspace.
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {FEATURES.map((f) => (
                  <div
                    key={f.title}
                    id={f.id}
                    className="p-5 rounded-[20px] transition-all hover:-translate-y-0.5"
                    style={{
                      background: C.surface,
                      border: `1px solid ${C.border}`,
                      boxShadow: "0 1px 0 rgba(255,255,255,0.9) inset",
                    }}
                  >
                    <div
                      className="size-9 rounded-[10px] grid place-items-center mb-4"
                      style={{ background: C.bg, border: `1px solid ${C.borderSoft}` }}
                    >
                      <f.icon className="size-4" style={{ color: C.ink }} />
                    </div>
                    <h3 className="text-[15px] font-semibold tracking-tight" style={{ color: C.ink }}>
                      {f.title}
                    </h3>
                    <p className="mt-1.5 text-[13.5px]" style={{ color: C.muted, lineHeight: 1.5 }}>
                      {f.body}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ============ SAFETY / CTA STRIP ============ */}
          <section className="px-5 sm:px-8 pb-12 sm:pb-16">
            <div
              className="max-w-[1080px] mx-auto rounded-[20px] p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5"
              style={{ background: C.ink, color: C.bg }}
            >
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em]" style={{ color: "rgba(246,242,234,0.55)" }}>
                  Paper trading only
                </div>
                <div className="mt-1.5 text-[18px] sm:text-[20px] font-medium tracking-tight">
                  No real-money execution. All trades simulated for research.
                </div>
              </div>
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2 text-[14px] font-medium px-5 py-2.5 rounded-full"
                style={{ background: C.bg, color: C.ink }}
              >
                Open terminal
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </section>

          {/* ============ FOOTER ============ */}
          <footer
            className="px-5 sm:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-[12px]"
            style={{ borderTop: `1px solid ${C.borderSoft}`, color: C.muted }}
          >
            <div>© {new Date().getFullYear()} Quanta Terminal — Educational platform. Not investment advice.</div>
            <div className="flex items-center gap-4">
              <a href="#features" className="hover:opacity-70">Features</a>
              <a href="#ai-agent" className="hover:opacity-70">AI Agent</a>
              <a href="#paper-trading" className="hover:opacity-70">Paper Trading</a>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

/* ---------------- helpers ---------------- */

const FEATURES = [
  {
    id: "ai-agent",
    icon: Bot,
    title: "Autonomous AI Paper Trading",
    body: "An always-on AI agent that scans, scores, and executes paper trades with auditable decision replays.",
  },
  {
    id: "paper-trading",
    icon: Shield,
    title: "Portfolio Risk Analytics",
    body: "Concentration, sector exposure, drawdown and liquidity guards before every simulated order.",
  },
  {
    id: "news",
    icon: Newspaper,
    title: "News & Sentiment Intelligence",
    body: "Real IDX news with sentiment scoring and freshness signals wired into the AI's reasoning.",
  },
  {
    id: "backtest",
    icon: LineChart,
    title: "Strategy Backtest & Forward Test",
    body: "Validate strategies on historical data, then forward-test live with paper capital.",
  },
];

function MockCard({
  className = "",
  title,
  icon,
  badge,
  children,
}: {
  className?: string;
  title: string;
  icon?: React.ReactNode;
  badge?: { text: string; tone: "bull" | "bear" | "neutral" };
  children: React.ReactNode;
}) {
  const toneColor =
    badge?.tone === "bull" ? "#16a34a" : badge?.tone === "bear" ? "#dc2626" : C.muted;
  return (
    <div
      className={`p-4 rounded-[14px] ${className}`}
      style={{ background: C.surfaceMuted, border: `1px solid ${C.borderSoft}` }}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5 text-[11.5px] font-medium uppercase tracking-wider" style={{ color: C.muted }}>
          {icon}
          {title}
        </div>
        {badge && (
          <span
            className="text-[9.5px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{
              color: toneColor,
              background: badge.tone === "bull" ? "rgba(22,163,74,0.10)" : "rgba(220,38,38,0.10)",
            }}
          >
            {badge.text}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function Sparkline() {
  // Static decorative path
  const d =
    "M0,42 L20,38 L40,40 L60,30 L80,33 L100,24 L120,28 L140,18 L160,22 L180,14 L200,16 L220,8 L240,12 L260,5";
  return (
    <svg viewBox="0 0 260 50" className="w-full h-[60px]">
      <defs>
        <linearGradient id="sl" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#16a34a" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#16a34a" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L260,50 L0,50 Z`} fill="url(#sl)" />
      <path d={d} fill="none" stroke="#16a34a" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function RiskBar({ label, value, tone = "default" }: { label: string; value: number; tone?: "ok" | "default" }) {
  const color = tone === "ok" ? "#16a34a" : value > 60 ? "#dc2626" : value > 35 ? "#d97706" : C.ink;
  return (
    <div className="mb-2 last:mb-0">
      <div className="flex items-center justify-between text-[11.5px] mb-1">
        <span style={{ color: C.inkSoft }}>{label}</span>
        <span className="font-mono" style={{ color: C.muted }}>{value}%</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: C.bg }}>
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}

function SentimentDial() {
  // 0..100 score → arc fill
  const score = 64;
  const angle = (score / 100) * 180;
  const r = 38;
  const cx = 60;
  const cy = 50;
  const rad = (deg: number) => (deg - 180) * (Math.PI / 180);
  const x = cx + r * Math.cos(rad(angle));
  const y = cy + r * Math.sin(rad(angle));
  const largeArc = angle > 180 ? 1 : 0;
  return (
    <div className="relative">
      <svg viewBox="0 0 120 60" className="w-full h-[70px]">
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke={C.borderSoft} strokeWidth="6" strokeLinecap="round" />
        <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 ${largeArc} 1 ${x} ${y}`} fill="none" stroke="#16a34a" strokeWidth="6" strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-end pb-1">
        <div className="text-[18px] font-semibold tracking-tight">{score}</div>
        <div className="text-[10px] uppercase tracking-wider" style={{ color: C.muted }}>Bullish</div>
      </div>
    </div>
  );
}
