// Public cron endpoint: market data snapshot (IHSG + breadth).
// Schedulers should call every 1–5 minutes during IDX hours; off-hours runs
// honestly record `market_closed` instead of treating it as an error.
//
// Behavior:
//   - Reads IDX session state (Asia/Jakarta).
//   - If market is closed → writes one snapshot with status=market_closed,
//     freshness=stale, source_status=market_closed. Does NOT call providers.
//   - If market is open  → tries Yahoo Finance (.JK / ^JKSE) as primary,
//     falls back to Stooq EOD on failure. Quota-protected providers are
//     skipped with status=quota_protected (not an error).
//   - Mirrors per-source health into data_sources + source_health_logs.
import { createFileRoute } from "@tanstack/react-router";
import { checkCronSecret } from "@/lib/cron-auth.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getIDXMarketSession } from "@/lib/idx-market-session";
import {
  logSourceHealth,
  type HonestSourceStatus,
} from "@/lib/data-source-health.server";

interface IndexQuote {
  source_key: string;
  value: number | null;
  change_pct: number | null;
  status: HonestSourceStatus;
  message?: string;
}

async function fetchYahooComposite(): Promise<IndexQuote> {
  const url =
    "https://query1.finance.yahoo.com/v8/finance/chart/%5EJKSE?range=1d&interval=5m";
  try {
    const res = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 QuantaTerminal/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return {
        source_key: "idx_composite_yahoo",
        value: null,
        change_pct: null,
        status: res.status === 429 ? "rate_limited" : "failed",
        message: `HTTP ${res.status}`,
      };
    }
    const json: any = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta?.regularMarketPrice) {
      return {
        source_key: "idx_composite_yahoo",
        value: null,
        change_pct: null,
        status: "degraded",
        message: "missing regularMarketPrice",
      };
    }
    const v = Number(meta.regularMarketPrice);
    const prev = Number(meta.chartPreviousClose ?? meta.previousClose ?? v);
    const change = prev > 0 ? ((v - prev) / prev) * 100 : null;
    return {
      source_key: "idx_composite_yahoo",
      value: v,
      change_pct: change,
      status: "active",
    };
  } catch (e: any) {
    return {
      source_key: "idx_composite_yahoo",
      value: null,
      change_pct: null,
      status: "failed",
      message: String(e?.message ?? e),
    };
  }
}

async function fetchStooqComposite(): Promise<IndexQuote> {
  const url = "https://stooq.com/q/l/?s=^jkse&f=sd2t2ohlcv&h&e=csv";
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      return {
        source_key: "stooq",
        value: null,
        change_pct: null,
        status: "failed",
        message: `HTTP ${res.status}`,
      };
    }
    const txt = await res.text();
    const lines = txt.trim().split(/\r?\n/);
    if (lines.length < 2) {
      return {
        source_key: "stooq",
        value: null,
        change_pct: null,
        status: "no_event",
        message: "empty",
      };
    }
    const cols = lines[1].split(",");
    const close = Number(cols[6]);
    const open = Number(cols[3]);
    const change = open > 0 ? ((close - open) / open) * 100 : null;
    if (!Number.isFinite(close)) {
      return {
        source_key: "stooq",
        value: null,
        change_pct: null,
        status: "degraded",
        message: "unparseable",
      };
    }
    return {
      source_key: "stooq",
      value: close,
      change_pct: change,
      status: "active",
    };
  } catch (e: any) {
    return {
      source_key: "stooq",
      value: null,
      change_pct: null,
      status: "failed",
      message: String(e?.message ?? e),
    };
  }
}

async function handle(request: Request) {
  const denied = checkCronSecret(request);
  if (denied) {
    await logSourceHealth({
      source_key: "idx_composite_yahoo",
      pipeline_name: "market",
      status: "unauthorized",
      message: "unauthorized_cron",
    });
    return denied;
  }

  const startedAt = Date.now();
  const session = getIDXMarketSession();
  const nowIso = new Date().toISOString();

  // ── Market closed: honest status, no provider calls ───────────────────────
  if (!session.isOpen) {
    const message =
      session.state === "weekend"
        ? "Akhir pekan — pasar IDX tutup"
        : session.state === "holiday"
          ? "Hari libur bursa"
          : session.state === "lunch_break"
            ? "Jeda istirahat Sesi I → Sesi II"
            : session.state === "pre_open"
              ? "Belum jam buka (pre-open)"
              : "Pasar IDX tutup (post-close)";

    try {
      await supabaseAdmin.from("market_data_snapshots").insert({
        snapshot_at: nowIso,
        session_status: session.state,
        market_status: "closed",
        source_primary: null,
        source_count: 0,
        idx_composite: null,
        idx_composite_change_pct: null,
        advancing_count: 0,
        declining_count: 0,
        flat_count: 0,
        ad_ratio: null,
        data_quality_score: 0,
        freshness_status: "stale",
        source_status: "market_closed",
        message,
        raw_payload: { session },
      } as any);
    } catch {
      /* best-effort */
    }

    await Promise.all([
      logSourceHealth({
        source_key: "idx_composite_yahoo",
        pipeline_name: "market",
        status: "market_closed",
        message,
        duration_ms: Date.now() - startedAt,
      }),
      logSourceHealth({
        source_key: "idx_composite_serpapi",
        pipeline_name: "market",
        status: "market_closed",
        message,
      }),
    ]);

    return Response.json({
      ok: true,
      status: "market_closed",
      session: session.state,
      message,
    });
  }

  // ── Market open: try primary then fallback ────────────────────────────────
  let usedFallback = false;
  let primary = await fetchYahooComposite();
  let secondary: IndexQuote | null = null;

  if (primary.status !== "active") {
    secondary = await fetchStooqComposite();
    if (secondary.status === "active") {
      usedFallback = true;
    }
  }

  const winner =
    primary.status === "active"
      ? primary
      : secondary?.status === "active"
        ? secondary
        : null;

  const dataQuality = winner ? (usedFallback ? 0.6 : 0.9) : 0;
  const freshness =
    winner && !usedFallback
      ? "live"
      : winner
        ? "delayed"
        : "unavailable";
  const sourceStatus: HonestSourceStatus = winner
    ? usedFallback
      ? "fallback_active"
      : "active"
    : primary.status;

  try {
    await supabaseAdmin.from("market_data_snapshots").insert({
      snapshot_at: nowIso,
      session_status: session.state,
      market_status: "open",
      source_primary: winner?.source_key ?? primary.source_key,
      source_count: secondary ? 2 : 1,
      idx_composite: winner?.value ?? null,
      idx_composite_change_pct: winner?.change_pct ?? null,
      advancing_count: 0,
      declining_count: 0,
      flat_count: 0,
      ad_ratio: null,
      data_quality_score: dataQuality,
      freshness_status: freshness,
      source_status: sourceStatus,
      message: winner ? null : (primary.message ?? "all providers failed"),
      raw_payload: { primary, secondary, session },
    } as any);
  } catch {
    /* best-effort */
  }

  // Per-source health mirror
  await logSourceHealth({
    source_key: primary.source_key,
    pipeline_name: "market",
    status: primary.status,
    duration_ms: Date.now() - startedAt,
    items_fetched: primary.value != null ? 1 : 0,
    message: primary.message ?? null,
  });
  if (secondary) {
    await logSourceHealth({
      source_key: secondary.source_key,
      pipeline_name: "market",
      status: secondary.status,
      items_fetched: secondary.value != null ? 1 : 0,
      message: secondary.message ?? null,
    });
  }
  // SerpApi composite is quota-protected unless user explicitly enables it.
  await logSourceHealth({
    source_key: "idx_composite_serpapi",
    pipeline_name: "market",
    status: process.env.SERPAPI_API_KEY ? "quota_protected" : "not_configured",
    message: process.env.SERPAPI_API_KEY
      ? "Dilindungi kuota bulanan — hanya dipakai jika sumber utama gagal"
      : "SERPAPI_API_KEY belum dikonfigurasi",
  });

  return Response.json({
    ok: true,
    status: sourceStatus,
    session: session.state,
    idx_composite: winner?.value ?? null,
    change_pct: winner?.change_pct ?? null,
    used_fallback: usedFallback,
    data_quality: dataQuality,
    freshness,
  });
}

export const Route = createFileRoute("/api/public/cron/market-snapshot")({
  server: {
    handlers: {
      GET: async ({ request }) => handle(request),
      POST: async ({ request }) => handle(request),
    },
  },
});
