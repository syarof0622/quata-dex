// Lightweight in-memory per-IP rate limiter for paid-API server functions.
// Worker instances are short-lived, so this is a soft cap (defense-in-depth)
// — not a hard global quota. Pair with provider-side quota checks.
import { getRequest } from "@tanstack/react-start/server";

type Bucket = { count: number; windowStart: number };
const buckets = new Map<string, Bucket>();
const MAX_ENTRIES = 5000;

function clientIp(): string {
  try {
    const req = getRequest();
    const h = req.headers;
    return (
      h.get("cf-connecting-ip") ??
      h.get("x-real-ip") ??
      (h.get("x-forwarded-for") ?? "").split(",")[0].trim() ??
      "anon"
    ) || "anon";
  } catch {
    return "anon";
  }
}

export class RateLimitError extends Error {
  code = "RATE_LIMITED" as const;
  retryAfter: number;
  constructor(retryAfter: number) {
    super("Rate limit exceeded. Try again shortly.");
    this.retryAfter = retryAfter;
  }
}

/**
 * Enforce N requests per windowMs per IP for a given bucket key.
 * Throws RateLimitError when exceeded.
 */
export function enforceRateLimit(bucketKey: string, limit: number, windowMs: number): void {
  const ip = clientIp();
  const key = `${bucketKey}:${ip}`;
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || now - b.windowStart >= windowMs) {
    b = { count: 0, windowStart: now };
    buckets.set(key, b);
  }
  b.count += 1;
  if (buckets.size > MAX_ENTRIES) {
    // prune oldest entries
    for (const [k, v] of buckets) {
      if (now - v.windowStart >= windowMs) buckets.delete(k);
      if (buckets.size <= MAX_ENTRIES * 0.8) break;
    }
  }
  if (b.count > limit) {
    const retryAfter = Math.ceil((windowMs - (now - b.windowStart)) / 1000);
    throw new RateLimitError(Math.max(1, retryAfter));
  }
}
