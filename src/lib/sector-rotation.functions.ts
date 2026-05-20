// Phase B: IDX sector rotation. For each sector basket, computes relative
// strength vs IDX (^JKSE) over recent weeks and classifies as
// leading / rotating_in / rotating_out / lagging.
import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { IDX_UNIVERSE_BY_SECTOR, ALL_SECTORS, type Sector } from "./sectors";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

type Bar = { t: number; c: number };

async function fetchDaily(symbol: string, range = "3mo"): Promise<Bar[]> {
  try {
    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}`,
      { headers: { "User-Agent": UA, Accept: "application/json" } },
    );
    if (!r.ok) return [];
    const j = await r.json();
    const res = j?.chart?.result?.[0];
    const ts: number[] = res?.timestamp ?? [];
    const closes: (number | null)[] = res?.indicators?.quote?.[0]?.close ?? [];
    const out: Bar[] = [];
    for (let i = 0; i < ts.length; i++) {
      const c = closes[i];
      if (c != null && Number.isFinite(c)) out.push({ t: ts[i], c });
    }
    return out;
  } catch {
    return [];
  }
}

function pctChange(bars: Bar[], lookback: number): number | null {
  if (bars.length <= lookback) return null;
  const last = bars[bars.length - 1].c;
  const prev = bars[bars.length - 1 - lookback].c;
  if (!prev) return null;
  return ((last - prev) / prev) * 100;
}

type SectorScore = {
  sector: Sector;
  relative_strength: number;
  momentum_score: number;
  breadth_score: number;
  classification:
    | "leading"
    | "rotating_in"
    | "rotating_out"
    | "lagging"
    | "neutral";
  top_symbols: { symbol: string; ret20: number }[];
  reasoning: string;
};

export const computeSectorRotation = createServerFn({ method: "GET" }).handler(
  async (): Promise<SectorScore[]> => {
    const idx = await fetchDaily("^JKSE", "3mo");
    const idx20 = pctChange(idx, 20) ?? 0;
    const idx60 = pctChange(idx, 60) ?? 0;

    const out: SectorScore[] = [];
    for (const sector of ALL_SECTORS) {
      const symbols = IDX_UNIVERSE_BY_SECTOR.get(sector) ?? [];
      if (symbols.length === 0) continue;

      const bars = await Promise.all(symbols.map((s) => fetchDaily(s, "3mo")));
      const ret20Arr: { symbol: string; ret20: number }[] = [];
      const ret60Arr: number[] = [];
      for (let i = 0; i < symbols.length; i++) {
        const r20 = pctChange(bars[i], 20);
        const r60 = pctChange(bars[i], 60);
        if (r20 != null) ret20Arr.push({ symbol: symbols[i], ret20: r20 });
        if (r60 != null) ret60Arr.push(r60);
      }
      if (ret20Arr.length === 0) continue;

      const avg20 = ret20Arr.reduce((a, b) => a + b.ret20, 0) / ret20Arr.length;
      const avg60 = ret60Arr.length
        ? ret60Arr.reduce((a, b) => a + b, 0) / ret60Arr.length
        : 0;
      const rs20 = avg20 - idx20;
      const rs60 = avg60 - idx60;
      const breadth =
        (ret20Arr.filter((x) => x.ret20 > 0).length / ret20Arr.length) * 100;

      let classification: SectorScore["classification"] = "neutral";
      if (rs20 > 1 && rs60 > 1) classification = "leading";
      else if (rs20 > 1 && rs60 <= 1) classification = "rotating_in";
      else if (rs20 < -1 && rs60 >= -1) classification = "rotating_out";
      else if (rs20 < -1 && rs60 < -1) classification = "lagging";

      ret20Arr.sort((a, b) => b.ret20 - a.ret20);
      const top = ret20Arr.slice(0, 3);

      const score: SectorScore = {
        sector,
        relative_strength: Number(rs20.toFixed(2)),
        momentum_score: Number(avg20.toFixed(2)),
        breadth_score: Number(breadth.toFixed(0)),
        classification,
        top_symbols: top,
        reasoning: `RS20=${rs20.toFixed(2)}%, RS60=${rs60.toFixed(2)}%, breadth=${breadth.toFixed(0)}%.`,
      };
      out.push(score);

      await supabaseAdmin.from("sector_strength_snapshots").insert({
        sector,
        relative_strength: score.relative_strength,
        momentum_score: score.momentum_score,
        breadth_score: score.breadth_score,
        classification: score.classification,
        top_symbols: score.top_symbols,
        reasoning: score.reasoning,
      });
    }
    out.sort((a, b) => b.relative_strength - a.relative_strength);
    return out;
  },
);

export const getLatestSectorRotation = createServerFn({
  method: "GET",
}).handler(async () => {
  // Get one most-recent row per sector.
  const { data } = await supabaseAdmin
    .from("sector_strength_snapshots")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  const seen = new Set<string>();
  const out: any[] = [];
  for (const row of data ?? []) {
    if (seen.has(row.sector)) continue;
    seen.add(row.sector);
    out.push(row);
  }
  return out;
});
