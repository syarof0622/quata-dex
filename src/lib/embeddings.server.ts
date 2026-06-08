// Server-only helper for calling the Lovable AI Gateway embeddings endpoint.
// Uses openai/text-embedding-3-small (1536 dim) — compatible with pgvector
// HNSW (max 2000 dim) and cheap enough for high-volume backfill of news,
// fundamentals, charts, disclosures, agent decisions, and trade reviews.
//
// NEVER import this from client code. Reads LOVABLE_API_KEY from process.env.

const EMBED_URL = "https://ai.gateway.lovable.dev/v1/embeddings";
export const EMBED_MODEL = "openai/text-embedding-3-small";
export const EMBED_DIM = 1536;

export class EmbeddingError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "EmbeddingError";
  }
}

/**
 * Embed a batch of input strings. Returns one float[] per input, in order.
 * Trims and clips each input to ~8000 chars to stay well under the model
 * token cap and avoid 400s.
 */
export async function embedBatch(inputs: string[]): Promise<number[][]> {
  if (inputs.length === 0) return [];
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new EmbeddingError(500, "LOVABLE_API_KEY missing");

  const clipped = inputs.map((s) => (s ?? "").trim().slice(0, 8000)).map((s) => s || " ");

  const r = await fetch(EMBED_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: clipped }),
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new EmbeddingError(r.status, `embeddings ${r.status}: ${body.slice(0, 300)}`);
  }
  const j: any = await r.json();
  const data: any[] = j?.data ?? [];
  if (data.length !== clipped.length) {
    throw new EmbeddingError(500, `embedding count mismatch: got ${data.length}, expected ${clipped.length}`);
  }
  return data
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .map((d) => d.embedding as number[]);
}

export async function embedOne(input: string): Promise<number[]> {
  const [v] = await embedBatch([input]);
  return v;
}
