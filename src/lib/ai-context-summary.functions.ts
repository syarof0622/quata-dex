// Thin server-fn wrapper. Keep this file client-reachable but ensure the
// server-only `.server.ts` module is only imported inside the handler so its
// `@tanstack/react-start/server` transitive import never leaks to the client.
import { createServerFn } from "@tanstack/react-start";
import type { AIContextSummary } from "./ai-context-summary";

export type AIContextSummaryWithMeta = AIContextSummary & {
  lastUpdateLabel: string;
  recentAgentDecisionCount: number;
};

export const getAIContextSummaryServer = createServerFn({ method: "GET" })
  .handler(async (): Promise<AIContextSummaryWithMeta> => {
    const { getAIContextSummaryServerImpl } = await import("./ai-context-summary.server");
    return getAIContextSummaryServerImpl();
  });
