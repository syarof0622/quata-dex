import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getLearningOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const [runRes, symRes, stratRes, evRes] = await Promise.all([
      supabase.from("daily_learning_runs").select("*").order("run_started_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("trade_memory_by_symbol").select("*").eq("user_id", userId),
      supabase.from("strategy_performance_memory").select("*").eq("user_id", userId),
      supabase.from("learning_events").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(10),
    ]);
    const symbols = symRes.data ?? [];
    const strategies = stratRes.data ?? [];
    const activeCooldowns = symbols.filter((s: any) => s.cooldown_until && new Date(s.cooldown_until) > new Date()).length;
    return {
      lastRun: runRes.data ?? null,
      totals: {
        symbolsTracked: symbols.length,
        strategiesTracked: strategies.length,
        activeCooldowns,
        pausedStrategies: strategies.filter((s: any) => s.is_paused).length,
      },
      recentEvents: evRes.data ?? [],
    };
  });

export const getSymbolMemory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { data } = await supabase
      .from("trade_memory_by_symbol")
      .select("*")
      .eq("user_id", userId)
      .order("sample_count", { ascending: false })
      .limit(200);
    return data ?? [];
  });

export const getStrategyMemory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { data } = await supabase.from("strategy_performance_memory").select("*").eq("user_id", userId);
    return data ?? [];
  });

export const getSectorMemory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { data } = await supabase.from("sector_performance_memory").select("*").eq("user_id", userId);
    return data ?? [];
  });

export const getRegimeMemory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { data } = await supabase.from("market_regime_performance_memory").select("*").eq("user_id", userId);
    return data ?? [];
  });

export const getLearningEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { data } = await supabase
      .from("learning_events")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);
    return data ?? [];
  });

export const getMissedOpportunities = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context as any;
    const { data } = await supabase
      .from("blocked_decision_outcomes")
      .select("*")
      .eq("user_id", userId)
      .order("blocked_at", { ascending: false })
      .limit(50);
    return data ?? [];
  });

export const runDailyLearningNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as any;
    const { runDailyLearning } = await import("./daily-learning.server");
    return runDailyLearning({ userId });
  });
