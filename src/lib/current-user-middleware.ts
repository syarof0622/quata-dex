// Client-safe wrapper that registers the withCurrentUser middleware.
// The actual AsyncLocalStorage + Supabase work lives in current-user.server.ts
// and is dynamically imported inside the .server() handler so node:async_hooks
// never leaks into the client bundle via src/start.ts.
import { createMiddleware } from "@tanstack/react-start";

export const withCurrentUser = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const { getRequestHeader } = await import("@tanstack/react-start/server");
    const mod = await import("./current-user.server");
    return mod.runWithCurrentUser(next, getRequestHeader("authorization") ?? getRequestHeader("Authorization"));
  },
);
