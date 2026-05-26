// Official IDX/BEI disclosures — read + risk-flag derivation.
// Server-only (uses supabaseAdmin).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type DisclosureType =
  | "financial_report" | "dividend" | "rights_issue" | "buyback"
  | "stock_split" | "uma" | "suspension" | "public_expose"
  | "governance" | "debt" | "other";

export type DisclosureRow = {
  id: string;
  symbol: string;
  source: string;
  disclosure_type: DisclosureType;
  title: string;
  url: string | null;
  published_at: string;
  impact_level: "high" | "medium" | "low";
  sentiment: "positive" | "negative" | "neutral";
  extracted_summary: string | null;
  risk_flag: string | null;
};

export function deriveRiskFlags(d: Pick<DisclosureRow, "disclosure_type" | "sentiment" | "impact_level" | "risk_flag">): string[] {
  const flags = new Set<string>();
  if (d.risk_flag) flags.add(d.risk_flag);
  if (d.disclosure_type === "suspension") flags.add("suspension_risk");
  if (d.disclosure_type === "uma") flags.add("uma_risk");
  if (d.disclosure_type === "rights_issue") flags.add("dilution_risk");
  if (d.disclosure_type === "debt") flags.add("debt_risk");
  if (d.disclosure_type === "governance") flags.add("governance_risk");
  if (d.sentiment === "negative" && d.impact_level === "high") flags.add("negative_disclosure");
  return [...flags];
}

/** Returns latest disclosure for a single symbol within `windowHours` (default 7d). */
export async function getLatestDisclosureFor(symbol: string, windowHours = 24 * 7): Promise<DisclosureRow | null> {
  const base = symbol.replace(/\.JK$/i, "");
  const since = new Date(Date.now() - windowHours * 3600_000).toISOString();
  const { data } = await supabaseAdmin
    .from("official_disclosures")
    .select("*")
    .in("symbol", [base, symbol])
    .gte("published_at", since)
    .order("published_at", { ascending: false })
    .limit(1);
  return (data?.[0] as DisclosureRow) ?? null;
}

/** Returns latest disclosures for many symbols (most recent per symbol). */
export async function getLatestDisclosuresForSymbols(symbols: string[], windowHours = 24 * 7): Promise<Record<string, DisclosureRow>> {
  if (!symbols.length) return {};
  const bases = Array.from(new Set(symbols.flatMap(s => [s, s.replace(/\.JK$/i, "")])));
  const since = new Date(Date.now() - windowHours * 3600_000).toISOString();
  const { data } = await supabaseAdmin
    .from("official_disclosures")
    .select("*")
    .in("symbol", bases)
    .gte("published_at", since)
    .order("published_at", { ascending: false })
    .limit(200);
  const out: Record<string, DisclosureRow> = {};
  for (const row of (data ?? []) as DisclosureRow[]) {
    const key = row.symbol;
    if (!out[key]) out[key] = row;
    const dotted = key.endsWith(".JK") ? key : `${key}.JK`;
    if (!out[dotted]) out[dotted] = row;
  }
  return out;
}

export const listOfficialDisclosures = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({
    symbol: z.string().optional(),
    limit: z.number().int().min(1).max(100).optional(),
    type: z.string().optional(),
  }).parse(d ?? {}))
  .handler(async ({ data }) => {
    let q = supabaseAdmin.from("official_disclosures").select("*").order("published_at", { ascending: false }).limit(data.limit ?? 30);
    if (data.symbol) {
      const base = data.symbol.replace(/\.JK$/i, "");
      q = q.in("symbol", [base, data.symbol]);
    }
    if (data.type) q = q.eq("disclosure_type", data.type);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as DisclosureRow[];
  });
