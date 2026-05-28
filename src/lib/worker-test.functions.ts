// Test triggers for cron-protected workers. Reads CRON_SECRET from env on the
// server and calls each public cron endpoint with `x-cron-secret`. The secret
// never leaves the server. Used by System Health → "Test Worker" buttons.
import { createServerFn } from "@tanstack/react-start";
import { getRequestHost, getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";

export type WorkerKey =
  | "news-ingest"
  | "disclosure-ingest"
  | "fundamentals"
  | "ai-agent"
  | "alerts"
  | "news-disclosure-link"
  | "orders";

const WORKER_PATHS: Record<WorkerKey, string> = {
  "news-ingest": "/api/public/cron/news-ingest",
  "disclosure-ingest": "/api/public/cron/disclosure-ingest",
  "fundamentals": "/api/public/cron/fundamentals",
  "ai-agent": "/api/public/cron/ai-agent",
  "alerts": "/api/public/cron/alerts",
  "news-disclosure-link": "/api/public/cron/news-disclosure-link",
  "orders": "/api/public/cron/orders",
};

const InputSchema = z.object({
  worker: z.enum([
    "news-ingest",
    "disclosure-ingest",
    "fundamentals",
    "ai-agent",
    "alerts",
    "news-disclosure-link",
    "orders",
  ]),
});

export const triggerWorker = createServerFn({ method: "POST" })
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data }) => {
    const ranAt = new Date().toISOString();
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      return {
        ok: false,
        worker: data.worker,
        status: 503,
        error: "cron_secret_not_configured",
        message:
          "CRON_SECRET is not set. Add it in project secrets before testing workers.",
        ranAt,
        payload: null as any,
      };
    }

    const host = getRequestHost();
    const proto =
      getRequestHeader("x-forwarded-proto") ??
      (host.includes("localhost") ? "http" : "https");
    const url = `${proto}://${host}${WORKER_PATHS[data.worker]}`;

    const startedAt = Date.now();
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "x-cron-secret": secret,
          "content-type": "application/json",
        },
      });
      const text = await res.text();
      let payload: any = null;
      try { payload = text ? JSON.parse(text) : null; } catch { payload = { raw: text.slice(0, 500) }; }
      const durationMs = Date.now() - startedAt;

      if (!res.ok) {
        return {
          ok: false,
          worker: data.worker,
          status: res.status,
          error: payload?.error ?? "worker_failed",
          message:
            res.status === 401
              ? "Endpoint reached, but x-cron-secret was rejected."
              : payload?.message ?? `Worker returned HTTP ${res.status}.`,
          ranAt,
          durationMs,
          payload: payload as any,
        };
      }

      return {
        ok: true,
        worker: data.worker,
        status: res.status,
        message: payload?.message ?? "Worker triggered successfully.",
        ranAt,
        durationMs,
        payload: payload as any,
      };
    } catch (e: any) {
      return {
        ok: false,
        worker: data.worker,
        status: 0,
        error: "network_error",
        message: `Worker unreachable: ${e?.message ?? "network error"}`,
        ranAt,
        durationMs: Date.now() - startedAt,
        payload: null as any,
      };
    }
  });
