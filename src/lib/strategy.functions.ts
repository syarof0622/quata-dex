import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const StrategyOutSchema = z.object({
  name: z.string(),
  description: z.string(),
  rule: z.enum(["ema_cross", "rsi_reversal", "macd_cross"]),
  rationale: z.string(),
});

export const generateStrategy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { prompt: string; symbol?: string }) =>
    z.object({ prompt: z.string().min(3).max(500), symbol: z.string().optional() }).parse(d))
  .handler(async ({ context, data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI not configured");

    const sys = `You are a quantitative strategy designer. Given the user's idea, pick the closest strategy from the supported set: ema_cross (trend-following EMA12/26 crossover), rsi_reversal (RSI(14) bounces from 30/70), macd_cross (MACD histogram zero-cross momentum). Return ONLY a function call.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: `Idea: ${data.prompt}${data.symbol ? `\nSymbol: ${data.symbol}` : ""}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "design_strategy",
            description: "Pick a quant strategy and explain it.",
            parameters: {
              type: "object",
              properties: {
                name: { type: "string", description: "Short strategy name" },
                description: { type: "string", description: "1-2 sentence summary" },
                rule: { type: "string", enum: ["ema_cross", "rsi_reversal", "macd_cross"] },
                rationale: { type: "string", description: "Why this fits the user's idea" },
              },
              required: ["name", "description", "rule", "rationale"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "design_strategy" } },
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      console.error("AI gateway error", resp.status, t);
      throw new Error(resp.status === 402 ? "AI credits exhausted" : resp.status === 429 ? "Rate limit, try again" : "AI generation failed");
    }
    const j = await resp.json();
    const args = j.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) throw new Error("AI returned no strategy");
    const parsed = StrategyOutSchema.parse(typeof args === "string" ? JSON.parse(args) : args);

    const { data: row, error } = await context.supabase.from("strategies").insert({
      user_id: context.userId,
      name: parsed.name,
      description: parsed.description + "\n\nRationale: " + parsed.rationale,
      rules_json: { rule: parsed.rule } as any,
      ai_generated: true,
    }).select().single();
    if (error) throw error;
    return { strategy: row, ...parsed };
  });
