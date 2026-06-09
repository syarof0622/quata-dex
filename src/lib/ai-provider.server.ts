/**
 * AI provider router with auto-fallback chain.
 *
 * Order (first available is tried first; on quota/rate/5xx errors we move
 * to the next provider in the chain):
 *   1. GEMINI_API_KEY      → Google Gemini direct (OpenAI-compatible)
 *   2. OPENROUTER_API_KEY  → OpenRouter
 *   3. LOVABLE_API_KEY     → Lovable AI Gateway
 *
 * Models are auto-picked per provider based on heuristic complexity.
 */

export type AIComplexity = "light" | "balanced" | "deep";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";
const LOVABLE_BASE = "https://ai.gateway.lovable.dev/v1";

export function pickComplexity(lastUserText: string): AIComplexity {
  const t = (lastUserText ?? "").toLowerCase();
  const len = t.length;
  const deepRe = /(analisa|analisis|analyze|kenapa|why|jelaskan detail|strategi|backtest|valuasi|undervalue|prediksi|forecast|tesis|deep dive|breakdown|portfolio|attribution|risiko|risk|skenario|scenario|fundamental|laporan keuangan|earnings|optimal)/;
  const lightRe = /^(hai|halo|hi|hello|ok|oke|thanks|makasih|terima kasih|harga|price|berapa)\b/;
  if (deepRe.test(t) || len > 400) return "deep";
  if (lightRe.test(t) && len < 80) return "light";
  return "balanced";
}

export type AIProviderName = "gemini" | "openrouter" | "lovable";

export type AIProviderInfo = {
  provider: AIProviderName;
  baseUrl: string;
  apiKey: string;
  model: string;
  extraHeaders?: Record<string, string>;
};

function modelFor(provider: AIProviderName, complexity: AIComplexity, hint?: string): string {
  if (hint) return hint;
  if (provider === "gemini") {
    return complexity === "deep" ? "gemini-2.5-pro"
      : complexity === "light" ? "gemini-2.5-flash-lite"
      : "gemini-2.5-flash";
  }
  if (provider === "openrouter") {
    // OpenRouter free models rotate frequently; avoid the retired
    // google/gemini-2.0-flash-exp:free endpoint that returns 404.
    return complexity === "deep" ? "deepseek/deepseek-v4-flash:free"
      : complexity === "light" ? "google/gemma-4-31b-it:free"
      : "deepseek/deepseek-v4-flash:free";
  }
  // lovable
  return complexity === "deep" ? "google/gemini-3-flash-preview"
    : complexity === "light" ? "google/gemini-2.5-flash-lite"
    : "google/gemini-3-flash-preview";
}

/**
 * Return the full ordered fallback chain of available providers.
 * Providers without an API key are skipped silently.
 */
export function getAIProviderChain(opts: { lastUserText: string; modelHint?: string }): AIProviderInfo[] {
  const complexity = pickComplexity(opts.lastUserText);
  const chain: AIProviderInfo[] = [];

  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    chain.push({
      provider: "gemini",
      baseUrl: GEMINI_BASE,
      apiKey: geminiKey,
      model: modelFor("gemini", complexity, opts.modelHint),
    });
  }

  const orKey = process.env.OPENROUTER_API_KEY;
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (lovableKey) {
    chain.push({
      provider: "lovable",
      baseUrl: LOVABLE_BASE,
      apiKey: lovableKey,
      model: modelFor("lovable", complexity, opts.modelHint),
    });
  }

  if (orKey) {
    chain.push({
      provider: "openrouter",
      baseUrl: OPENROUTER_BASE,
      apiKey: orKey,
      model: modelFor("openrouter", complexity, opts.modelHint),
      extraHeaders: {
        "HTTP-Referer": process.env.OPENROUTER_REFERRER ?? "https://quata-dex.lovable.app",
        "X-Title": "Quanta Terminal",
      },
    });
  }

  if (chain.length === 0) {
    throw new Error("No AI provider configured (set GEMINI_API_KEY, OPENROUTER_API_KEY, or LOVABLE_API_KEY)");
  }
  return chain;
}

/** Back-compat: returns the first provider in the chain. */
export function pickAIProvider(opts: { lastUserText: string; modelHint?: string }): AIProviderInfo {
  return getAIProviderChain(opts)[0];
}

export function aiAuthHeaders(p: AIProviderInfo): Record<string, string> {
  if (p.provider === "lovable") {
    return {
      "Lovable-API-Key": p.apiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
      "Content-Type": "application/json",
      ...(p.extraHeaders ?? {}),
    };
  }
  return {
    Authorization: `Bearer ${p.apiKey}`,
    "Content-Type": "application/json",
    ...(p.extraHeaders ?? {}),
  };
}

/** True when the HTTP status indicates we should try the next provider. */
export function shouldFailover(status: number): boolean {
  // 429 = rate limit / quota, 402 = credit exhausted, 5xx = upstream failure,
  // 401/403 = invalid key, 404/410 = model retired/not found.
  return status === 429 || status === 402 || status === 401 || status === 403 || status === 404 || status === 410 || status >= 500;
}

/**
 * Fetch /chat/completions across the provider chain. The `buildBody` callback
 * receives the chosen provider so it can fill in the model name.
 *
 * Returns the first successful Response, or the last failing Response if all
 * providers are exhausted.
 */
export async function aiChatFetch(
  chain: AIProviderInfo[],
  buildBody: (p: AIProviderInfo) => unknown,
): Promise<{ response: Response; provider: AIProviderInfo }> {
  let lastResp: Response | null = null;
  let lastProv: AIProviderInfo | null = null;
  for (const p of chain) {
    try {
      const resp = await fetch(`${p.baseUrl}/chat/completions`, {
        method: "POST",
        headers: aiAuthHeaders(p),
        body: JSON.stringify(buildBody(p)),
      });
      if (resp.ok) return { response: resp, provider: p };
      lastResp = resp;
      lastProv = p;
      if (!shouldFailover(resp.status)) {
        // Non-recoverable (e.g. 400 bad request) — stop trying.
        return { response: resp, provider: p };
      }
      console.warn(`[ai-provider] ${p.provider} failed status=${resp.status}, trying next…`);
    } catch (e) {
      console.warn(`[ai-provider] ${p.provider} threw:`, e);
      lastProv = p;
    }
  }
  if (lastResp && lastProv) return { response: lastResp, provider: lastProv };
  throw new Error("AI provider chain exhausted with no response");
}
