import { createFileRoute } from "@tanstack/react-router";
import { checkCronSecret } from "@/lib/cron-auth.server";

export const Route = createFileRoute("/api/public/cron/daily-learning")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = checkCronSecret(request);
        if (denied) return denied;
        const { runDailyLearning } = await import("@/lib/daily-learning.server");
        const result = await runDailyLearning();
        return Response.json(result);
      },
      GET: async ({ request }) => {
        const denied = checkCronSecret(request);
        if (denied) return denied;
        const { runDailyLearning } = await import("@/lib/daily-learning.server");
        const result = await runDailyLearning();
        return Response.json(result);
      },
    },
  },
});
