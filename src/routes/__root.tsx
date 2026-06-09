import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { AuthProvider } from "@/hooks/use-auth";
import { LanguageProvider } from "@/hooks/use-language";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { installBrowserErrorLogger, reportError } from "@/lib/error-logger.browser";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center panel p-8">
        <h1 className="text-7xl font-bold neon-text">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">The page you're looking for doesn't exist.</p>
        <div className="mt-6">
          <Link to="/" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportError(error, { module: "router", action: "route_error_boundary", handled: true });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center panel p-8">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => { router.invalidate(); reset(); }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Try again
          </button>
          <a href="/" className="inline-flex items-center justify-center rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent">
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Quanta Terminal — AI Institutional Trading Platform" },
      { name: "description", content: "AI-powered institutional trading intelligence: realtime charts, signals, smart-money flow, screening, and a paper-trading simulation lab." },
      { property: "og:title", content: "Quanta Terminal — AI Institutional Trading Platform" },
      { property: "og:description", content: "AI-powered institutional trading intelligence: realtime charts, signals, smart-money flow, screening, and a paper-trading simulation lab." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Quanta Terminal — AI Institutional Trading Platform" },
      { name: "twitter:description", content: "AI-powered institutional trading intelligence: realtime charts, signals, smart-money flow, screening, and a paper-trading simulation lab." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/b3f622be-66cc-4fad-964d-f61082402db2" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/b3f622be-66cc-4fad-964d-f61082402db2" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Quanta Terminal",
          url: "https://quata-dex.lovable.app",
          logo: "https://quata-dex.lovable.app/favicon.ico",
          description:
            "AI-powered Indonesian stock research terminal with realtime market data, news sentiment, smart-money flow, screening, and an autonomous paper-trading simulation lab.",
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Quanta Terminal",
          url: "https://quata-dex.lovable.app",
          description:
            "AI institutional trading intelligence and paper-trading simulation for IDX markets.",
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  useEffect(() => {
    installBrowserErrorLogger();
  }, []);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("quanta:prefs");
      const p = raw ? JSON.parse(raw) : {};
      // Dark institutional theme is the default.
      const theme = p.theme ?? "dark";
      const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const useDark = theme === "dark" || (theme === "system" && sysDark);
      document.documentElement.classList.toggle("dark", useDark);
      if (p.uiLang) document.documentElement.lang = p.uiLang;
    } catch {/* */}
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <AuthProvider>
          <TooltipProvider delayDuration={150}>
            <Outlet />
            <Toaster richColors closeButton position="top-right" theme="dark" />
          </TooltipProvider>
        </AuthProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}
