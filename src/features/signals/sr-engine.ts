import type { Candle } from "@/lib/indicators";
import { swingPivots } from "./ta-extras";

export type SRZone = {
  price: number;
  low: number;
  high: number;
  kind: "support" | "resistance";
  strength: number; // 0..100
  touches: number;
  label?: "Major" | "Minor" | "Psychological";
};

// Cluster pivots within tolerance (% of price), score by repeat touches & recency
export function detectSRZones(c: Candle[], tolerancePct = 0.6): SRZone[] {
  if (c.length < 30) return [];
  const piv = swingPivots(c, 3, 3);
  const last = c[c.length - 1].close;
  const tol = (last * tolerancePct) / 100;

  type Cluster = { kind: "support" | "resistance"; prices: number[]; lastIdx: number };
  const clusters: Cluster[] = [];
  for (const p of piv) {
    const kind = p.kind === "low" ? "support" : "resistance";
    const found = clusters.find(
      cl => cl.kind === kind && Math.abs(cl.prices.reduce((a, b) => a + b, 0) / cl.prices.length - p.price) <= tol,
    );
    if (found) { found.prices.push(p.price); found.lastIdx = Math.max(found.lastIdx, p.idx); }
    else clusters.push({ kind, prices: [p.price], lastIdx: p.idx });
  }

  const zones: SRZone[] = clusters.map(cl => {
    const avg = cl.prices.reduce((a, b) => a + b, 0) / cl.prices.length;
    const touches = cl.prices.length;
    const recency = cl.lastIdx / c.length; // 0..1
    const strength = Math.min(100, touches * 22 + recency * 40);
    return {
      price: avg,
      low: avg - tol,
      high: avg + tol,
      kind: cl.kind,
      strength,
      touches,
      label: touches >= 3 ? "Major" : "Minor",
    };
  });

  // Add psychological round numbers near current price
  const mag = Math.pow(10, Math.floor(Math.log10(last)));
  const round = Math.round(last / mag) * mag;
  if (Math.abs(round - last) / last < 0.05 && !zones.some(z => Math.abs(z.price - round) < tol)) {
    zones.push({
      price: round,
      low: round - tol,
      high: round + tol,
      kind: round > last ? "resistance" : "support",
      strength: 35,
      touches: 0,
      label: "Psychological",
    });
  }

  return zones.sort((a, b) => b.strength - a.strength).slice(0, 8);
}

export function nearestZones(zones: SRZone[], price: number) {
  const support = zones
    .filter(z => z.kind === "support" && z.price < price)
    .sort((a, b) => b.price - a.price)[0];
  const resistance = zones
    .filter(z => z.kind === "resistance" && z.price > price)
    .sort((a, b) => a.price - b.price)[0];
  return { support, resistance };
}
