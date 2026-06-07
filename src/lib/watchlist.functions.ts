// Supabase-backed watchlist. Shared across devices via single super-admin user_id.
import { createServerFn } from "@tanstack/react-start";
import { currentUserId } from "@/lib/current-user.server";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";


export const getWatchlist = createServerFn({ method: "GET" }).handler(async () => {
  const { data, error } = await supabaseAdmin
    .from("watchlist")
    .select("symbol, added_at")
    .eq("user_id", currentUserId())
    .order("added_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const addToWatchlist = createServerFn({ method: "POST" })
  .inputValidator((d: { symbol: string }) =>
    z.object({ symbol: z.string().min(1).max(20) }).parse(d),
  )
  .handler(async ({ data }) => {
    const symbol = data.symbol.trim().toUpperCase();
    if (!symbol) return { ok: false };
    // Ignore duplicates silently
    const { data: existing } = await supabaseAdmin
      .from("watchlist").select("id").eq("user_id", currentUserId()).eq("symbol", symbol).maybeSingle();
    if (existing) return { ok: true };
    const { error } = await supabaseAdmin.from("watchlist").insert({ user_id: currentUserId(), symbol });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeFromWatchlist = createServerFn({ method: "POST" })
  .inputValidator((d: { symbol: string }) =>
    z.object({ symbol: z.string().min(1).max(20) }).parse(d),
  )
  .handler(async ({ data }) => {
    const symbol = data.symbol.trim().toUpperCase();
    const { error } = await supabaseAdmin
      .from("watchlist").delete().eq("user_id", currentUserId()).eq("symbol", symbol);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
