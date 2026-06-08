// Server-only current-user resolver backed by AsyncLocalStorage.
// Populated by the global function middleware `withCurrentUser` (registered in src/start.ts)
// or by `runAsUser(uid, fn)` for cron/admin code that iterates users.
//
// NOTE: This file may be transitively imported by `.functions.ts` modules that
// are also reachable from the client bundle. To avoid pulling `node:async_hooks`
// into the browser, the AsyncLocalStorage is initialised lazily inside a
// server-only guard. On the client these helpers throw if ever invoked (they
// should never be — server functions only run server-side).

type Store = { userId: string | null };

let alsInstance: { getStore(): Store | undefined; run<T>(s: Store, fn: () => T): T } | null = null;
let alsInitPromise: Promise<void> | null = null;

function isServer(): boolean {
  return typeof window === "undefined";
}

async function ensureAls(): Promise<void> {
  if (alsInstance) return;
  if (!alsInitPromise) {
    alsInitPromise = (async () => {
      // Dynamic import keeps node:async_hooks out of the client bundle while
      // working in ESM (no `require` available on the Worker runtime).
      const mod = await import(/* @vite-ignore */ "node:async_hooks");
      alsInstance = new mod.AsyncLocalStorage();
    })();
  }
  await alsInitPromise;
}

function getAls() {
  if (!isServer()) {
    throw new Error("current-user.server.ts invoked in the browser — this module is server-only.");
  }
  if (!alsInstance) {
    throw new Error("AsyncLocalStorage not initialised — call ensureAls() first.");
  }
  return alsInstance;
}

export function currentUserIdOrNull(): string | null {
  if (!isServer()) return null;
  return getAls().getStore()?.userId ?? null;
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
  return getAls().run({ userId }, fn as () => any) as any;
}

/** Internal: resolve bearer -> user id and stash in ALS for the handler. */
export async function runWithCurrentUser<T>(next: () => Promise<T>): Promise<T> {
  const { getRequest } = await import("@tanstack/react-start/server");
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
  return getAls().run({ userId }, () => next()) as Promise<T>;
}
