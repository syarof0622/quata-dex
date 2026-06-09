import { reportClientError } from "@/lib/error-log.functions";

type ClientErrorPayload = {
  level?: "debug" | "info" | "warning" | "error" | "fatal";
  source?: "browser" | "api" | "unknown";
  module?: string;
  action?: string;
  message?: string;
  stack?: string | null;
  metadata?: Record<string, unknown>;
  handled?: boolean;
};

let installed = false;
let lastSentAt = 0;
const seen = new Map<string, number>();

function text(value: unknown, fallback = "Unknown browser error"): string {
  if (value instanceof Error) return value.message || fallback;
  if (typeof value === "string") return value || fallback;
  try { return JSON.stringify(value).slice(0, 4000) || fallback; } catch { return fallback; }
}

function stack(value: unknown): string | null {
  if (value instanceof Error) return value.stack ?? null;
  return null;
}

function fingerprint(payload: { source?: string; module?: string; action?: string; message: string; stack?: string | null }) {
  const raw = [payload.source ?? "browser", payload.module ?? "", payload.action ?? "", payload.message, payload.stack?.split("\n")[0] ?? ""].join("|");
  let hash = 0;
  for (let i = 0; i < raw.length; i++) hash = Math.imul(31, hash) + raw.charCodeAt(i) | 0;
  return Math.abs(hash).toString(36);
}

export function reportError(payload: ClientErrorPayload | Error | unknown, context?: Omit<ClientErrorPayload, "message" | "stack">) {
  if (typeof window === "undefined") return;
  const errPayload: ClientErrorPayload = payload && typeof payload === "object" && !(payload instanceof Error) && "message" in payload
    ? payload as ClientErrorPayload
    : { ...context, message: text(payload), stack: stack(payload) };
  const message = text(errPayload.message);
  const fp = fingerprint({ ...errPayload, message });
  const now = Date.now();
  if (now - (seen.get(fp) ?? 0) < 10_000 || now - lastSentAt < 750) return;
  seen.set(fp, now);
  lastSentAt = now;
  void reportClientError({
    data: {
      level: errPayload.level ?? "error",
      source: errPayload.source ?? "browser",
      module: errPayload.module ?? context?.module ?? "browser",
      action: errPayload.action ?? context?.action ?? "runtime_error",
      message,
      stack: errPayload.stack ?? null,
      path: window.location.pathname + window.location.search,
      metadata: {
        url: window.location.href,
        userAgent: navigator.userAgent,
        ...(errPayload.metadata ?? {}),
      },
      fingerprint: fp,
      handled: errPayload.handled ?? context?.handled ?? false,
      occurredAt: new Date().toISOString(),
    },
  }).catch(() => {});
}

export function installBrowserErrorLogger() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (event) => {
    reportError(event.error ?? event.message, {
      module: "browser",
      action: "window_error",
      metadata: { filename: event.filename, lineno: event.lineno, colno: event.colno },
    });
  });
  window.addEventListener("unhandledrejection", (event) => {
    reportError(event.reason, { module: "browser", action: "unhandled_rejection" });
  });
}