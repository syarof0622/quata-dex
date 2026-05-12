import { createFileRoute } from "@tanstack/react-router";
import { ChatPanel } from "@/components/ChatPanel";

export const Route = createFileRoute("/_authenticated/ai")({
  head: () => ({ meta: [{ title: "AI Analyst — Quanta Terminal" }] }),
  component: () => (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">AI Trading Analyst</h1>
        <p className="text-sm text-muted-foreground">Streaming markdown · grounded in current market context.</p>
      </div>
      <ChatPanel />
    </div>
  ),
});
