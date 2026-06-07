import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const UpdateSchema = z.object({
  ai_enabled: z.boolean().optional(),
  agent_mode: z.enum(["conservative","balanced","progressive","swing_max","recovery_swing_max","research_max"]).optional(),
  allocation_mode: z.enum(["conservative","balanced","high_conviction_swing"]).optional(),
  risk_profile: z.enum(["low","medium","high","balanced"]).optional(),
  target_exposure_pct: z.number().min(0).max(1).optional(),
  max_exposure_pct: z.number().min(0).max(1).optional(),
  max_active_positions: z.number().int().min(1).max(50).optional(),
  max_new_entries_per_day: z.number().int().min(0).max(50).optional(),
  max_trades_per_day: z.number().int().min(0).max(50).optional(),
  max_trades_per_symbol_per_week: z.number().int().min(0).max(10).optional(),
  min_trade_quality_score: z.number().min(0).max(100).optional(),
  min_risk_reward: z.number().min(0).max(20).optional(),
  risk_per_trade_pct: z.number().min(0).max(0.5).optional(),
  min_position_weight_pct: z.number().min(0).max(1).optional(),
  max_position_weight_pct: z.number().min(0).max(1).optional(),
  use_swing_max: z.boolean().optional(),
  use_recovery_mode: z.boolean().optional(),
  use_symbol_cooldown: z.boolean().optional(),
  use_strategy_kill_switch: z.boolean().optional(),
  use_trailing_stop: z.boolean().optional(),
  use_partial_take_profit: z.boolean().optional(),
  allow_pyramiding: z.boolean().optional(),
  allow_average_down: z.boolean().optional(),
  preferred_holding_days_min: z.number().int().min(0).max(365).optional(),
  preferred_holding_days_max: z.number().int().min(0).max(365).optional(),
  max_holding_days: z.number().int().min(0).max(365).optional(),
});

export const getMyAiSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    let { data } = await supabase.from("user_ai_settings").select("*").eq("user_id", userId).maybeSingle();
    if (!data) {
      const { data: created } = await supabase.from("user_ai_settings").insert({ user_id: userId } as any).select("*").single();
      data = created;
    }
    return { settings: data };
  });

export const updateMyAiSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("user_ai_settings").update(data as any).eq("user_id", userId);
    if (error) {
      // If row doesn't exist yet, upsert it.
      const { error: e2 } = await supabase.from("user_ai_settings").upsert({ user_id: userId, ...data } as any, { onConflict: "user_id" });
      if (e2) throw new Error(e2.message);
    }
    return { ok: true };
  });
