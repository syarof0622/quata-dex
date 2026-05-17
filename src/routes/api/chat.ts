import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { messages, system } = await request.json() as {
            messages: { role: "user" | "assistant"; content: string }[];
            system?: string;
          };
          if (!Array.isArray(messages) || messages.length === 0) {
            return new Response(JSON.stringify({ error: "messages required" }), { status: 400 });
          }
          if (messages.length > 40) {
            return new Response(JSON.stringify({ error: "Too many messages" }), { status: 400 });
          }
          for (const m of messages) {
            if (!m || typeof m.content !== "string" || (m.role !== "user" && m.role !== "assistant")) {
              return new Response(JSON.stringify({ error: "invalid message" }), { status: 400 });
            }
            if (m.content.length > 8000) {
              return new Response(JSON.stringify({ error: "message too long" }), { status: 400 });
            }
          }
          const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
          if (!LOVABLE_API_KEY) {
            return new Response(JSON.stringify({ error: "AI gateway not configured" }), { status: 500 });
          }

          const safeSystem = typeof system === "string" && system.length > 0 && system.length <= 2000 ? system : undefined;
          const sys = safeSystem ?? `You are an institutional-grade trading analyst AI assistant inside a Bloomberg-style trading platform.
You explain market behavior with technical and fundamental reasoning, give risk-aware trade ideas, and never give financial advice.
Use concise markdown with bullet points and short tables when helpful. Always include a "Risks" section.`;

          const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "google/gemini-3-flash-preview",
              messages: [{ role: "system", content: sys }, ...messages],
              stream: true,
            }),
          });

          if (!upstream.ok) {
            if (upstream.status === 429) return new Response(JSON.stringify({ error: "Rate limited. Try again shortly." }), { status: 429 });
            if (upstream.status === 402) return new Response(JSON.stringify({ error: "Out of AI credits. Add more in Settings → Workspace → Usage." }), { status: 402 });
            const t = await upstream.text();
            console.error("AI gateway error", upstream.status, t);
            return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500 });
          }

          return new Response(upstream.body, { headers: { "Content-Type": "text/event-stream" } });
        } catch (e) {
          console.error("chat route error", e);
          return new Response(JSON.stringify({ error: "Unknown error" }), { status: 500 });
        }
      },
    },
  },
});
