import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  LineChart,
  Newspaper,
  Shield,
  TrendingUp,
  Activity,
  Layers,
  Gauge,
  History,
  ShieldCheck,
  Database,
  CircleDot,
  Languages,
} from "lucide-react";
import { useLang } from "@/hooks/use-language";

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
        fontFamily: 'ui-sans-serif, -apple-system, "Inter", "Helvetica Neue", system-ui, sans-serif',
      }}
    >
      <div aria-hidden className="fixed inset-0 pointer-events-none z-0"
        style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)", backgroundSize: "22px 22px" }} />
      <div aria-hidden className="absolute pointer-events-none z-0"
        style={{ top: "-200px", left: "50%", transform: "translateX(-50%)", width: "1400px", height: "900px",
          background: "radial-gradient(ellipse at center, rgba(0,255,178,0.10) 0%, rgba(0,255,178,0.04) 35%, transparent 70%)", filter: "blur(30px)" }} />
      <div aria-hidden className="fixed inset-0 pointer-events-none z-0"
        style={{ background: "radial-gradient(ellipse 120% 80% at 50% 40%, transparent 50%, rgba(0,0,0,0.45) 100%)" }} />
      <div aria-hidden className="fixed inset-0 pointer-events-none z-0"
        style={{ background: "linear-gradient(180deg, rgba(10,16,24,0.6) 0%, transparent 30%, transparent 80%, rgba(10,16,24,0.8) 100%)" }} />
      <div aria-hidden className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="lp-orb lp-orb-1" />
        <div className="lp-orb lp-orb-2" />
        <div className="lp-orb lp-orb-3" />
      </div>

      <div className="relative z-10 lp-anim">
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

function LangToggle() {
  const { lang, setLang, L } = useLang();
  const next = lang === "id" ? "en" : "id";
  return (
    <button
      type="button"
      onClick={() => setLang(next)}
      title={L.landing.nav.language}
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium hover:opacity-80 transition"
      style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.inkSoft }}
    >
      <Languages className="w-3.5 h-3.5" />
      {lang === "id" ? "🇮🇩 ID" : "🇬🇧 EN"}
    </button>
  );
}

function Nav() {
  const { L } = useLang();
  const N = L.landing.nav;
  return (
    <header className="w-full">
      <div className="max-w-[1440px] mx-auto px-6 lg:px-10 flex items-center justify-between" style={{ height: 68 }}>
        <Link to="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-[13px] font-bold" style={{ background: C.ink, color: C.bg }}>Q</div>
          <span className="text-[15px] font-semibold tracking-tight">
            Quanta<span style={{ color: C.muted }}>.Terminal</span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-7 text-[13.5px]" style={{ color: C.inkSoft }}>
          <a href="#features" className="hover:opacity-70 transition-opacity">{N.features}</a>
          <a href="#ai-agent" className="hover:opacity-70 transition-opacity">{N.aiAgent}</a>
          <a href="#paper" className="hover:opacity-70 transition-opacity">{N.paperTrading}</a>
          <a href="#intelligence" className="hover:opacity-70 transition-opacity">{N.intelligence}</a>
          <a href="#risk" className="hover:opacity-70 transition-opacity">{N.riskEngine}</a>
        </nav>

        <div className="flex items-center gap-3">
          <LangToggle />
          <Link to="/auth" className="hidden sm:inline text-[13.5px] hover:opacity-70" style={{ color: C.inkSoft }}>
            {N.signIn}
          </Link>
          <Link to="/auth"
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-medium transition-transform hover:scale-[1.02]"
            style={{ background: C.ink, color: C.bg }}>
            {N.getStarted}
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
      <div className="w-full" style={{ borderBottom: `1px solid ${C.borderSoft}` }} />
    </header>
  );
}

function Hero() {
  const { L } = useLang();
  const H = L.landing.hero;
  return (
    <section className="max-w-[1440px] mx-auto px-6 lg:px-10 pt-16 md:pt-24 pb-10 text-center">
      <div className="max-w-[1100px] mx-auto">
        <div className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[11px] font-medium tracking-[0.12em] uppercase"
          style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.inkSoft }}>
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: C.green, boxShadow: `0 0 8px ${C.green}` }} />
          {H.badge}
        </div>

        <h1 className="mt-7 font-semibold tracking-tight"
          style={{ fontSize: "clamp(42px, 7.5vw, 88px)", lineHeight: 1.02, letterSpacing: "-0.035em" }}>
          {H.titleA}
          <br />
          <span style={{ color: C.muted }}>{H.titleB}</span>
        </h1>

        <p className="mt-7 mx-auto text-[16px] md:text-[18px] leading-relaxed" style={{ color: C.muted, maxWidth: 720 }}>
          {H.sub}
        </p>

        <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link to="/auth"
            className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-[14px] font-medium transition-transform hover:scale-[1.02]"
            style={{ background: C.ink, color: C.bg }}>
            {H.ctaPrimary}
            <ArrowRight className="w-4 h-4" />
          </Link>
          <a href="#mockup"
            className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-[14px] font-medium"
            style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.ink }}>
            {H.ctaSecondary}
            <ArrowUpRight className="w-4 h-4" />
          </a>
        </div>

        <div className="mt-8 flex items-center justify-center gap-6 text-[12px]" style={{ color: C.muted }}>
          <span className="inline-flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> {H.trust1}</span>
          <span className="hidden sm:inline-flex items-center gap-1.5"><Database className="w-3.5 h-3.5" /> {H.trust2}</span>
          <span className="hidden md:inline-flex items-center gap-1.5"><Activity className="w-3.5 h-3.5" /> {H.trust3}</span>
        </div>
      </div>
    </section>
  );
}

function MockupSection() {
  const { L } = useLang();
  const M = L.landing.mockup;
  return (
    <section id="mockup" className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 pb-24">
      <div className="mx-auto w-full overflow-hidden"
        style={{ maxWidth: 1240, borderRadius: 28, background: C.surface, border: `1px solid ${C.border}`,
          boxShadow: "0 1px 0 rgba(255,255,255,0.6) inset, 0 30px 80px -30px rgba(20,18,15,0.25), 0 8px 24px -12px rgba(20,18,15,0.1)" }}>
        <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: `1px solid ${C.borderSoft}`, background: C.surfaceMuted }}>
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full" style={{ background: "#ff5f57" }} />
            <span className="w-3 h-3 rounded-full" style={{ background: "#febc2e" }} />
            <span className="w-3 h-3 rounded-full" style={{ background: "#28c840" }} />
          </div>
          <div className="ml-4 text-[11px] font-medium px-3 py-1 rounded-md"
            style={{ background: C.bg, color: C.muted, border: `1px solid ${C.borderSoft}` }}>
            quanta.terminal / dashboard
          </div>
        </div>

        <div className="p-4 sm:p-6 grid grid-cols-12 gap-4">
          <MockCard title={M.aiAgent} col="col-span-12 sm:col-span-6 lg:col-span-3 xl:col-span-3">
            <div className="flex items-center gap-1.5 mb-2">
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: C.green }} />
              <span className="text-[10px] font-semibold tracking-wider uppercase" style={{ color: C.green }}>{M.autoRunning}</span>
            </div>
            <div className="text-[11px]" style={{ color: C.muted }}>{M.paperOnly}</div>
            <div className="text-[18px] font-semibold mt-2">{M.decisions}</div>
            <div className="text-[10.5px] mt-0.5" style={{ color: C.muted }}>{M.lastDecision}</div>
          </MockCard>

          <MockCard title={M.portfolioRisk} col="col-span-12 sm:col-span-6 lg:col-span-3">
            <div className="grid grid-cols-2 gap-y-1.5 gap-x-3 text-[11px]">
              <span style={{ color: C.muted }}>{M.equity}</span>
              <span className="text-right font-medium">Rp 102.4M</span>
              <span style={{ color: C.muted }}>{M.cashBuffer}</span>
              <span className="text-right font-medium">38%</span>
              <span style={{ color: C.muted }}>{M.drawdown}</span>
              <span className="text-right font-medium" style={{ color: C.red }}>−2.1%</span>
            </div>
            <RiskBar label={M.riskLevel} value={42} />
          </MockCard>

          <MockCard title={M.marketPulse} col="col-span-12 sm:col-span-6 lg:col-span-3">
            <div className="text-[11px] mb-1.5" style={{ color: C.muted }}>{M.idxRegime}</div>
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium"
              style={{ background: "rgba(245,176,66,0.12)", color: C.amber, border: `1px solid rgba(245,176,66,0.35)` }}>
              <CircleDot className="w-3 h-3" /> {M.neutral}
            </div>
            <div className="mt-2.5 text-[11px]" style={{ color: C.muted }}>{M.breadth}</div>
            <div className="mt-1 text-[11px]" style={{ color: C.muted }}>{M.rotation}</div>
          </MockCard>

          <MockCard title={M.newsSentiment} col="col-span-12 sm:col-span-6 lg:col-span-3">
            <SentimentDial value={0.62} toneLabel={M.bullishTone} />
            <div className="mt-2 text-[11px]" style={{ color: C.muted }}>{M.highImpact}</div>
            <div className="text-[11px]" style={{ color: C.muted }}>{M.sourceHealth}</div>
          </MockCard>

          <MockCard title={M.equityCurve} col="col-span-12 lg:col-span-5">
            <Sparkline />
            <div className="mt-2 flex items-center justify-between text-[11px]" style={{ color: C.muted }}>
              <span>{M.paperPL30}</span>
              <span style={{ color: C.green }} className="font-medium">+4.83%</span>
            </div>
          </MockCard>

          <MockCard title={M.strategy} col="col-span-12 sm:col-span-6 lg:col-span-3">
            <div className="text-[12px] font-medium">{M.strategyName}</div>
            <div className="text-[10.5px] mt-0.5" style={{ color: C.muted }}>{M.fitsRegime}</div>
            <div className="grid grid-cols-2 gap-y-1 gap-x-3 mt-2 text-[11px]">
              <span style={{ color: C.muted }}>{M.backtest}</span>
              <span className="text-right font-medium">+18.4%</span>
              <span style={{ color: C.muted }}>{M.forward}</span>
              <span className="text-right font-medium">+6.1%</span>
              <span style={{ color: C.muted }}>{M.sample}</span>
              <span className="text-right font-medium">{M.good}</span>
            </div>
          </MockCard>

          <MockCard title={M.replay} col="col-span-12 sm:col-span-6 lg:col-span-4">
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
    <div className={`${col} rounded-2xl p-4`} style={{ background: C.surfaceMuted, border: `1px solid ${C.borderSoft}` }}>
      <div className="text-[10px] font-semibold tracking-[0.14em] uppercase mb-2" style={{ color: C.muted }}>{title}</div>
      {children}
    </div>
  );
}

function RiskBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="mt-2.5">
      <div className="flex justify-between text-[10.5px] mb-1" style={{ color: C.muted }}>
        <span>{label}</span><span>{value}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: C.bg2 }}>
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: `linear-gradient(90deg, ${C.green}, ${C.amber})` }} />
      </div>
    </div>
  );
}

function Sparkline() {
  const pts = [38, 42, 36, 44, 41, 48, 45, 52, 49, 55, 51, 58, 56, 62, 60];
  const w = 280, h = 60;
  const max = Math.max(...pts), min = Math.min(...pts);
  const d = pts.map((p, i) => {
    const x = (i / (pts.length - 1)) * w;
    const y = h - ((p - min) / (max - min)) * h;
    return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
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

function SentimentDial({ value, toneLabel }: { value: number; toneLabel: string }) {
  const pct = Math.max(0, Math.min(1, value));
  return (
    <div className="flex items-center gap-3">
      <div className="relative w-14 h-14">
        <svg viewBox="0 0 36 36" className="w-14 h-14 -rotate-90">
          <circle cx="18" cy="18" r="15" fill="none" stroke={C.borderSoft} strokeWidth="3" />
          <circle cx="18" cy="18" r="15" fill="none" stroke={C.green} strokeWidth="3" strokeLinecap="round"
            strokeDasharray={`${pct * 94.25} 94.25`} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-[12px] font-semibold">
          {Math.round(pct * 100)}
        </div>
      </div>
      <div className="text-[11px]" style={{ color: C.muted }}>{toneLabel}</div>
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
          style={{ background: palette.bg, color: palette.fg, border: `1px solid ${palette.border}` }}>{final}</span>
        <span className="hidden sm:inline text-[10px]" style={{ color: C.muted }}>{reason}</span>
      </div>
    </div>
  );
}

function FeatureSection() {
  const { L } = useLang();
  const F = L.landing.features;
  const icons = [Bot, Shield, TrendingUp, Newspaper, Layers, History];
  return (
    <section id="features" className="max-w-[1440px] mx-auto px-6 lg:px-10 py-20 md:py-28">
      <div className="max-w-[820px] mb-12">
        <h2 className="font-semibold tracking-tight" style={{ fontSize: "clamp(28px, 4vw, 44px)", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
          {F.title}
        </h2>
        <p className="mt-4 text-[15px] md:text-[17px]" style={{ color: C.muted }}>{F.sub}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
        {F.items.map((f, i) => {
          const Icon = icons[i] ?? Bot;
          return (
            <div key={f.title} className="p-6 rounded-3xl transition-transform hover:-translate-y-0.5"
              style={{ background: C.surface, border: `1px solid ${C.border}`, boxShadow: "0 1px 2px rgba(20,18,15,0.04)" }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                style={{ background: C.bg, border: `1px solid ${C.borderSoft}` }}>
                <Icon style={{ color: C.ink, width: 18, height: 18 }} />
              </div>
              <div className="text-[15px] font-semibold mb-1.5">{f.title}</div>
              <div className="text-[13.5px] leading-relaxed" style={{ color: C.muted }}>{f.body}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AiAgentSection() {
  const { L } = useLang();
  const A = L.landing.agent;
  return (
    <section id="ai-agent" className="py-20 md:py-28" style={{ background: C.bg2, borderTop: `1px solid ${C.borderSoft}`, borderBottom: `1px solid ${C.borderSoft}` }}>
      <div className="max-w-[1440px] mx-auto px-6 lg:px-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          <div className="lg:col-span-5">
            <div className="text-[11px] uppercase tracking-[0.14em] font-semibold" style={{ color: C.muted }}>
              <Bot className="w-3.5 h-3.5 inline mr-1.5" /> {A.kicker}
            </div>
            <h2 className="mt-3 font-semibold tracking-tight" style={{ fontSize: "clamp(28px, 4vw, 44px)", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
              {A.title}
            </h2>
            <p className="mt-4 text-[15px] md:text-[16px]" style={{ color: C.muted }}>{A.sub}</p>
            <ul className="mt-6 grid grid-cols-2 gap-y-2 gap-x-4">
              {A.bullets.map((b) => (
                <li key={b} className="flex items-center gap-2 text-[13.5px]" style={{ color: C.inkSoft }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: C.green }} />
                  {b}
                </li>
              ))}
            </ul>
            <div className="mt-6 p-4 rounded-2xl text-[13px]" style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.inkSoft }}>
              <div className="font-medium mb-1">{A.transparentTitle}</div>
              {A.transparentBody}
            </div>
          </div>

          <div className="lg:col-span-7">
            <div className="rounded-3xl p-6 md:p-8" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
              <div className="text-[11px] uppercase tracking-[0.14em] font-semibold mb-4" style={{ color: C.muted }}>
                {A.flowTitle}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {A.steps.map((s, i) => (
                  <div key={s} className="flex items-center gap-2">
                    <div className="px-3 py-2 rounded-xl text-[12.5px] font-medium" style={{ background: C.bg, border: `1px solid ${C.borderSoft}` }}>{s}</div>
                    {i < A.steps.length - 1 && <ArrowRight className="w-3.5 h-3.5" style={{ color: C.muted }} />}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
                <MiniStat label={A.stats.decisionsPerDay} value="~ 40" />
                <MiniStat label={A.stats.guardLatency} value="< 1s" />
                <MiniStat label={A.stats.auditRetention} value="100%" />
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

function RiskEngineSection() {
  const { L } = useLang();
  const R = L.landing.risk;
  const icons = [Layers, Gauge, TrendingUp, Activity, LineChart, Shield, CircleDot, Database];
  return (
    <section id="risk" className="max-w-[1440px] mx-auto px-6 lg:px-10 py-20 md:py-28">
      <div className="max-w-[820px] mb-12">
        <div className="text-[11px] uppercase tracking-[0.14em] font-semibold" style={{ color: C.muted }}>
          <Shield className="w-3.5 h-3.5 inline mr-1.5" /> {R.kicker}
        </div>
        <h2 className="mt-3 font-semibold tracking-tight" style={{ fontSize: "clamp(28px, 4vw, 44px)", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
          {R.title}
        </h2>
        <p className="mt-4 text-[15px] md:text-[17px]" style={{ color: C.muted }}>{R.sub}</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {R.guards.map((label, i) => {
          const Icon = icons[i] ?? Shield;
          return (
            <div key={label} className="p-5 rounded-2xl flex flex-col gap-3"
              style={{ background: C.surface, border: `1px solid ${C.border}` }}>
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: C.bg, border: `1px solid ${C.borderSoft}` }}>
                <Icon className="w-4 h-4" style={{ color: C.ink }} />
              </div>
              <div className="text-[13.5px] font-medium">{label}</div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function NewsSection() {
  const { L } = useLang();
  const N = L.landing.news;
  return (
    <section id="intelligence" className="py-20 md:py-28"
      style={{ background: C.bg2, borderTop: `1px solid ${C.borderSoft}`, borderBottom: `1px solid ${C.borderSoft}` }}>
      <div className="max-w-[1440px] mx-auto px-6 lg:px-10 grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
        <div className="lg:col-span-5">
          <div className="text-[11px] uppercase tracking-[0.14em] font-semibold" style={{ color: C.muted }}>
            <Newspaper className="w-3.5 h-3.5 inline mr-1.5" /> {N.kicker}
          </div>
          <h2 className="mt-3 font-semibold tracking-tight" style={{ fontSize: "clamp(28px, 4vw, 44px)", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
            {N.title}
          </h2>
          <p className="mt-4 text-[15px] md:text-[16px]" style={{ color: C.muted }}>{N.sub}</p>
        </div>
        <div className="lg:col-span-7">
          <div className="rounded-3xl p-2" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            {N.items.map((it, i) => (
              <div key={it} className="flex items-center justify-between px-5 py-3.5 text-[13.5px]"
                style={{ borderTop: i === 0 ? "none" : `1px solid ${C.borderSoft}` }}>
                <span style={{ color: C.inkSoft }}>{it}</span>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded"
                  style={{ background: "rgba(0,255,178,0.10)", color: C.green, border: `1px solid rgba(0,255,178,0.30)` }}>
                  {N.active}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function SafetySection() {
  const { L } = useLang();
  const S = L.landing.safety;
  return (
    <section id="paper" className="max-w-[1440px] mx-auto px-6 lg:px-10 py-20 md:py-28">
      <div className="relative rounded-3xl p-8 md:p-12 grid grid-cols-1 md:grid-cols-12 gap-8 items-center overflow-hidden animate-fade-in"
        style={{ background: `linear-gradient(135deg, ${C.surface} 0%, ${C.bg} 100%)`, border: `1px solid rgba(0,255,178,0.22)`,
          boxShadow: "0 30px 80px -40px rgba(0,255,178,0.22)" }}>
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 w-[420px] h-[420px] rounded-full blur-3xl opacity-30"
          style={{ background: "radial-gradient(closest-side, rgba(0,255,178,0.40), transparent 70%)" }} />
        <div className="md:col-span-2 flex md:justify-center relative">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center animate-scale-in"
            style={{ background: "rgba(0,255,178,0.10)", border: `1px solid rgba(0,255,178,0.30)` }}>
            <ShieldCheck className="w-6 h-6" style={{ color: C.green }} />
          </div>
        </div>
        <div className="md:col-span-10 relative">
          <h2 className="font-semibold tracking-tight" style={{ color: C.ink, fontSize: "clamp(24px, 3vw, 34px)", letterSpacing: "-0.02em", lineHeight: 1.15 }}>
            {S.title}
          </h2>
          <p className="mt-3 text-[15px] md:text-[16px]" style={{ color: C.inkSoft }}>{S.sub}</p>
          <ul className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6 text-[13.5px]" style={{ color: C.inkSoft }}>
            {S.points.map((p) => (
              <li key={p} className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: C.green }} /> {p}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[12.5px]" style={{ color: C.muted }}>{S.footer}</p>
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  const { L } = useLang();
  const F = L.landing.finalCta;
  return (
    <section className="max-w-[1440px] mx-auto px-6 lg:px-10 pb-24">
      <div className="text-center max-w-[760px] mx-auto py-10">
        <h2 className="font-semibold tracking-tight" style={{ fontSize: "clamp(32px, 5vw, 56px)", letterSpacing: "-0.025em", lineHeight: 1.05 }}>
          {F.title}
        </h2>
        <p className="mt-5 text-[16px] md:text-[18px]" style={{ color: C.muted }}>{F.sub}</p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link to="/auth"
            className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-[14px] font-medium transition-transform hover:scale-[1.02]"
            style={{ background: C.ink, color: C.bg }}>
            {F.primary} <ArrowRight className="w-4 h-4" />
          </Link>
          <Link to="/auth"
            className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-[14px] font-medium"
            style={{ background: C.surface, border: `1px solid ${C.border}`, color: C.ink }}>
            {F.secondary}
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const { L } = useLang();
  const N = L.landing.nav;
  const FT = L.landing.footer;
  return (
    <footer style={{ borderTop: `1px solid ${C.borderSoft}`, background: C.bg2 }}>
      <div className="max-w-[1440px] mx-auto px-6 lg:px-10 py-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[12px] font-bold" style={{ background: C.ink, color: C.bg }}>Q</div>
            <span className="text-[14px] font-semibold tracking-tight">
              Quanta<span style={{ color: C.muted }}>.Terminal</span>
            </span>
          </div>
          <div className="mt-2 text-[12.5px]" style={{ color: C.muted }}>{FT.tagline}</div>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-[13px]" style={{ color: C.inkSoft }}>
          <a href="#features" className="hover:opacity-70">{N.features}</a>
          <a href="#ai-agent" className="hover:opacity-70">{N.aiAgent}</a>
          <a href="#paper" className="hover:opacity-70">{N.paperTrading}</a>
          <a href="#risk" className="hover:opacity-70">{N.riskEngine}</a>
          <Link to="/auth" className="hover:opacity-70">{N.signIn}</Link>
        </nav>
      </div>
    </footer>
  );
}
