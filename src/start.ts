import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { withCurrentUser } from "@/lib/current-user-middleware";

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    const [{ errorToLogInput, logError }, { getRequestHeader, getRequestUrl }] = await Promise.all([
      import("@/lib/error-logger.server"),
      import("@tanstack/react-start/server"),
    ]);
    await logError(errorToLogInput(error, {
      source: "server",
      module: "request_middleware",
      action: "unhandled_request_error",
      path: getRequestUrl()?.pathname,
      userAgent: getRequestHeader("user-agent"),
    }));
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth, withCurrentUser],
  requestMiddleware: [errorMiddleware],
}));
