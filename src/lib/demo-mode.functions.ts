// Phase E: Demo / Onboarding mode. Tracks demo flag + completion on profile,
// seeds a default watchlist for new users.
import { createServerFn } from "@tanstack/react-start";
import { currentUserId } from "@/lib/current-user.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const DEFAULT_WATCHLIST = [
  "BBCA.JK",
  "BBRI.JK",
  "TLKM.JK",
  "ASII.JK",
  "GOTO.JK",
  "ANTM.JK",
  "UNVR.JK",
  "MDKA.JK",
];

async function ensureProfile() {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", currentUserId())
    .maybeSingle();
  if (data) return data;
  const { data: created } = await supabaseAdmin
    .from("profiles")
    .insert({ id: currentUserId(), display_name: "Trader" })
    .select("*")
    .single();
  return created;
}

export const getDemoStatus = createServerFn({ method: "GET" }).handler(
  async () => {
    const p = await ensureProfile();
    const { count } = await supabaseAdmin
      .from("watchlist")
      .select("id", { count: "exact", head: true })
      .eq("user_id", currentUserId());
    return {
      demo_mode: Boolean((p as any)?.demo_mode),
      onboarding_completed: Boolean((p as any)?.onboarding_completed),
      watchlist_count: count ?? 0,
    };
  },
);

export const setDemoMode = createServerFn({ method: "POST" })
  .inputValidator((input: { enabled: boolean }) => ({
    enabled: Boolean(input?.enabled),
  }))
  .handler(async ({ data }) => {
    await ensureProfile();
    await supabaseAdmin
      .from("profiles")
      .update({ demo_mode: data.enabled })
      .eq("id", currentUserId());
    return { ok: true };
  });

export const completeOnboarding = createServerFn({ method: "POST" }).handler(
  async () => {
    await ensureProfile();
    await supabaseAdmin
      .from("profiles")
      .update({ onboarding_completed: true })
      .eq("id", currentUserId());
    return { ok: true };
  },
);

export const seedDefaultWatchlist = createServerFn({ method: "POST" }).handler(
  async () => {
    const { data: existing } = await supabaseAdmin
      .from("watchlist")
      .select("symbol")
      .eq("user_id", currentUserId());
    const have = new Set((existing ?? []).map((r: any) => r.symbol));
    const toInsert = DEFAULT_WATCHLIST.filter((s) => !have.has(s)).map(
      (symbol) => ({ user_id: currentUserId(), symbol }),
    );
    if (toInsert.length === 0) return { inserted: 0 };
    await supabaseAdmin.from("watchlist").insert(toInsert);
    return { inserted: toInsert.length };
  },
);
