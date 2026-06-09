/**
 * AI provider router.
 *
 * If GEMINI_API_KEY is set, all chat completions go directly to Google's
 * Gemini API (OpenAI-compatible endpoint). Otherwise we fall back to the
 * Lovable AI Gateway. Tools, streaming, and tool_choice all work the same
 * way through Google's OpenAI-compatible surface.
 *
 * Models are auto-picked based on the heuristic complexity of the user's
 * last message. The caller can override via `modelHint`.
 */

export type AIComplexity = "light" | "balanced" | "deep";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";
const LOVABLE_BASE = "https://ai.gateway.lovable.dev/v1";

// Heuristic: pick complexity tier from the last user message.
export function pickComplexity(lastUserText: string): AIComplexity {
  const t = (lastUserText ?? "").toLowerCase();
  const len = t.length;
  // Heavy reasoning keywords (Indonesian + English)
  const deepRe = /(analisa|analisis|analyze|kenapa|why|jelaskan detail|strategi|backtest|valuasi|undervalue|prediksi|forecast|tesis|deep dive|breakdown|portfolio|attribution|risiko|risk|skenario|scenario|fundamental|laporan keuangan|earnings|optimal)/;
  // Lightweight chit-chat / short factual
  const lightRe = /^(hai|halo|hi|hello|ok|oke|thanks|makasih|terima kasih|harga|price|berapa)\b/;
  if (deepRe.test(t) || len > 400) return "deep";
  if (lightRe.test(t) && len < 80) return "light";
  return "balanced";
}

export type AIProviderInfo = {
  provider: "gemini" | "lovable";
  baseUrl: string;
  apiKey: string;
  model: string;
};

export function pickAIProvider(opts: {
  lastUserText: string;
  modelHint?: string;
}): AIProviderInfo {
  const geminiKey = process.env.GEMINI_API_KEY;
  const lovableKey = process.env.LOVABLE_API_KEY;
  const complexity = pickComplexity(opts.lastUserText);

  if (geminiKey) {
    // Google Gemini direct (OpenAI-compatible). Model names are bare.
    const model =
      opts.modelHint ??
      (complexity === "deep"
        ? "gemini-2.5-pro"
        : complexity === "light"
          ? "gemini-2.5-flash-lite"
          : "gemini-2.5-flash");
    return { provider: "gemini", baseUrl: GEMINI_BASE, apiKey: geminiKey, model };
  }

  if (!lovableKey) {
    throw new Error("No AI provider configured (set GEMINI_API_KEY or LOVABLE_API_KEY)");
  }
  // Lovable Gateway: namespaced model ids.
  const model =
    opts.modelHint ??
    (complexity === "deep"
      ? "google/gemini-3.1-pro-preview"
      : complexity === "light"
        ? "google/gemini-2.5-flash-lite"
        : "google/gemini-3-flash-preview");
  return { provider: "lovable", baseUrl: LOVABLE_BASE, apiKey: lovableKey, model };
}

export function aiAuthHeaders(p: AIProviderInfo): Record<string, string> {
  // Both Google and Lovable accept "Authorization: Bearer <key>".
  return { Authorization: `Bearer ${p.apiKey}`, "Content-Type": "application/json" };
}
