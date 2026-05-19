// AI Trade Agent cron worker. Runs one decision cycle per active agent.
// Frequency choice (every minute vs slower) is set in pg_cron. The handler is
// idempotent: cooldowns + idempotency keys protect against duplicate orders.
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runAgentOnce } from "@/lib/ai-trade-agent.functions";

export const Route = createFileRoute("/api/public/cron/ai-agent")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const cronSecret = process.env.CRON_SECRET;
        if (cronSecret) {
          const provided = request.headers.get("x-cron-secret")
            ?? new URL(request.url).searchParams.get("secret");
          if (provided !== cronSecret) return new Response("Unauthorized", { status: 401 });
        }

        const { data: agents, error } = await supabaseAdmin
          .from("ai_trade_agents").select("id, status, trading_enabled")
          .in("status", ["active_market_open", "active_market_break", "active_market_closed"])
          .eq("trading_enabled", true);
        if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

        const results: Array<{ id: string; executed: number; count: number; error?: string }> = [];
        for (const a of agents ?? []) {
          try {
            const r = await runAgentOnce(a.id);
            results.push({ id: a.id, executed: r.executed, count: r.decisions.length });
          } catch (e: any) {
            results.push({ id: a.id, executed: 0, count: 0, error: e?.message ?? "error" });
          }
        }
        return Response.json({ scanned: agents?.length ?? 0, results });
      },
    },
  },
});
