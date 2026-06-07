// Server-only current-user resolver backed by AsyncLocalStorage.
// Populated by the global function middleware `withCurrentUser` (registered in src/start.ts)
// or by `runAsUser(uid, fn)` for cron/admin code that iterates users.
import { AsyncLocalStorage } from "node:async_hooks";

import { getRequest } from "@tanstack/react-start/server";

type Store = { userId: string | null };
const als = new AsyncLocalStorage<Store>();

export function currentUserIdOrNull(): string | null {
  return als.getStore()?.userId ?? null;
}

export function currentUserId(): string {
  const id = currentUserIdOrNull();
  if (!id) {
    throw new Error("Unauthorized: silakan login terlebih dahulu untuk mengakses data ini.");
  }
  return id;
}

/** Run `fn` with a forced user id. Use in cron jobs that iterate over users. */
export function runAsUser<T>(userId: string, fn: () => Promise<T> | T): Promise<T> | T {
  return als.run({ userId }, fn as () => any) as any;
}

/** Internal: resolve bearer -> user id and stash in ALS for the handler. */
export async function runWithCurrentUser<T>(next: () => Promise<T>): Promise<T> {
  let userId: string | null = null;
  try {
    const request = getRequest();
    const authHeader = request?.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const { createClient } = await import("@supabase/supabase-js");
      const url = process.env.SUPABASE_URL;
      const key = process.env.SUPABASE_PUBLISHABLE_KEY;
      if (url && key) {
        const c = createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data } = await c.auth.getUser(token);
        userId = data.user?.id ?? null;
      }
    }
  } catch {
    userId = null;
  }
  return als.run({ userId }, () => next()) as Promise<T>;
}

