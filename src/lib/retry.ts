// Generic exponential-backoff retry helper used by background workers.
// Designed to be safe in a Worker runtime — pure Promise-based, no timers
// beyond setTimeout, no globals.
export type RetryOptions = {
  attempts?: number;
  baseMs?: number;
  maxMs?: number;
  // Return true to abort retrying (treat error as terminal).
  abortOn?: (err: unknown) => boolean;
  onAttempt?: (attempt: number, err: unknown) => void;
};

export type RetryResult<T> =
  | { ok: true; value: T; attempts: number }
  | { ok: false; error: unknown; attempts: number };

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: RetryOptions = {},
): Promise<RetryResult<T>> {
  const attempts = Math.max(1, opts.attempts ?? 3);
  const base = Math.max(50, opts.baseMs ?? 400);
  const max = Math.max(base, opts.maxMs ?? 4000);
  let lastErr: unknown = null;
  for (let i = 1; i <= attempts; i++) {
    try {
      const value = await fn();
      return { ok: true, value, attempts: i };
    } catch (err) {
      lastErr = err;
      opts.onAttempt?.(i, err);
      if (opts.abortOn?.(err)) break;
      if (i >= attempts) break;
      const delay = Math.min(max, base * Math.pow(2, i - 1)) + Math.random() * 100;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  return { ok: false, error: lastErr, attempts };
}
