import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Activity, BarChart3, Bot, ChevronRight, LineChart, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Quanta Terminal — AI Institutional Trading Platform" },
      { name: "description", content: "Realtime charts, AI trading signals, smart-money flow, screening, and a paper-trading simulation lab." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between px-6 lg:px-10 h-16 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="size-7 rounded-md bg-primary/15 grid place-items-center neon-border">
            <Activity className="size-4 text-primary" />
          </div>
          <span className="font-semibold tracking-tight">Quanta<span className="text-primary">.</span>Terminal</span>
        </div>
        <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
          <a href="#features" className="hover:text-foreground">Features</a>
          <a href="#modules" className="hover:text-foreground">Modules</a>
          <a href="#lab" className="hover:text-foreground">Simulation Lab</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/auth"><Button variant="ghost" size="sm">Sign in</Button></Link>
          <Link to="/auth"><Button size="sm">Open Terminal <ChevronRight className="size-4" /></Button></Link>
        </div>
      </header>

      <section className="relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-6 lg:px-10 pt-20 pb-24 text-center">
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 panel px-3 py-1 text-xs text-muted-foreground"
          >
            <span className="pulse-dot" /> LIVE · institutional-grade market intelligence
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.05 }}
            className="mt-6 text-4xl md:text-6xl font-bold tracking-tight"
          >
            The <span className="neon-text">AI Trading Terminal</span><br className="hidden md:block" />
            built for serious traders.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25, duration: 0.6 }}
            className="mt-5 max-w-2xl mx-auto text-muted-foreground"
          >
            Realtime charts, AI signal engine, smart-money flow, multi-timeframe analysis,
            and a full paper-trading simulation lab — all in one Bloomberg-grade workspace.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4, duration: 0.5 }}
            className="mt-8 flex items-center justify-center gap-3"
          >
            <Link to="/auth">
              <Button size="lg" className="neon-border">
                Launch Terminal <ChevronRight className="size-4" />
              </Button>
            </Link>
            <a href="#features"><Button size="lg" variant="outline">Explore features</Button></a>
          </motion.div>
        </div>
      </section>

      <section id="features" className="max-w-6xl mx-auto px-6 lg:px-10 pb-24 grid md:grid-cols-3 gap-4">
        {[
          { icon: Bot, title: "AI Signal Engine", body: "Weighted multi-factor scoring (trend, momentum, volume, volatility) with LLM reasoning. Confidence + risk surfaced." },
          { icon: LineChart, title: "Pro Charts", body: "TradingView-grade candlesticks, EMA/RSI/MACD/BB overlays, auto support/resistance zones." },
          { icon: TrendingUp, title: "Smart Money Flow", body: "Detect accumulation, distribution, unusual volume and block-trade-style spikes." },
          { icon: BarChart3, title: "Screener & Movers", body: "Top gainers/losers, breakout scanners, RSI extremes, EMA crossover lists." },
          { icon: ShieldCheck, title: "Simulation Lab", body: "Paper trade with virtual capital. Strategy builder + backtester. AI coaches your trades." },
          { icon: Sparkles, title: "AI Analyst Chat", body: "Ask anything: 'Why did NVDA drop?', 'Is AAPL overbought?'. Streaming, markdown answers." },
        ].map(({ icon: Icon, title, body }) => (
          <motion.div
            key={title}
            initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }} transition={{ duration: 0.4 }}
            className="panel p-5"
          >
            <Icon className="size-5 text-primary" />
            <h3 className="mt-3 font-semibold">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{body}</p>
          </motion.div>
        ))}
      </section>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        Quanta Terminal · Educational platform · Not investment advice.
      </footer>
    </div>
  );
}
