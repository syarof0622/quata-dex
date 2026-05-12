import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getWatchlist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase.from("watchlist").select("*").eq("user_id", userId).order("added_at", { ascending: false });
    return data ?? [];
  });

export const addToWatchlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { symbol: string }) => z.object({ symbol: z.string().min(1).toUpperCase() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("watchlist")
      .upsert({ user_id: userId, symbol: data.symbol }, { onConflict: "user_id,symbol" });
    if (error) throw error;
    return { ok: true };
  });

export const removeFromWatchlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { symbol: string }) => z.object({ symbol: z.string().min(1).toUpperCase() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await supabase.from("watchlist").delete().eq("user_id", userId).eq("symbol", data.symbol);
    return { ok: true };
  });
