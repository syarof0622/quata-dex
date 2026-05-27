import { createServerFn } from "@tanstack/react-start";
import { getRequestHost, getRequestHeader } from "@tanstack/react-start/server";

/**
 * Server-side test trigger for the AI Agent cron endpoint.
 * Reads CRON_SECRET from env and calls the public cron route with the
 * `x-cron-secret` header. The secret never leaves the server.
 */
export const testAIAgentCronServer = createServerFn({ method: "POST" }).handler(
  async () => {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      return {
        ok: false,
        status: 503,
        error: "cron_secret_not_configured",
        message:
          "CRON_SECRET is not set in project secrets. Add it before testing the cron.",
        ranAt: new Date().toISOString(),
      };
    }

    const host = getRequestHost();
    const proto =
      getRequestHeader("x-forwarded-proto") ??
      (host.includes("localhost") ? "http" : "https");
    const url = `${proto}://${host}/api/public/cron/ai-agent`;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "x-cron-secret": secret,
          "content-type": "application/json",
        },
      });
      const json: any = await res.json().catch(() => ({}));

      if (!res.ok) {
        return {
          ok: false,
          status: res.status,
          error: json?.error ?? "cron_failed",
          message:
            res.status === 401
              ? "Cron endpoint reachable, but request was rejected because x-cron-secret is missing or invalid."
              : json?.message ?? `Cron returned ${res.status}.`,
          ranAt: new Date().toISOString(),
        };
      }

      return {
        ok: true,
        status: res.status,
        message: json?.message ?? "Worker pinged successfully.",
        ranAt: json?.ranAt ?? new Date().toISOString(),
        decisions: json?.decisions ?? 0,
        executed: json?.executed ?? 0,
        blocked: json?.blocked ?? 0,
        session: json?.session ?? null,
      };
    } catch (e: any) {
      return {
        ok: false,
        status: 0,
        error: "network_error",
        message: `Cron unreachable: ${e?.message ?? "network error"}`,
        ranAt: new Date().toISOString(),
      };
    }
  },
);
