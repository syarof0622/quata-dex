// Disclosure intelligence — read + manual import server functions.
// Provides:
// - listDisclosureIntel({symbol?}) → { disclosures, corporateActions, regulatoryEvents }
// - getDisclosureContextFor(symbol) → server helper for AI app context + risk engine
// - importOfficialDisclosure / importCorporateAction / importRegulatoryEvent
//
// Manual imports always set source = "manual_import" (or caller-provided) but
// the UI must label these as "manual" not "IDX official".
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  classifyDisclosureImpact,
  classifyCorporateActionImpact,
  classifyRegulatoryEventImpact,
  classifyDisclosureFreshness,
} from "./disclosure-classifier.server";

const SymbolSchema = z.object({ symbol: z.string().optional(), limit: z.number().int().min(1).max(100).optional() });

export const listDisclosureIntel = createServerFn({ method: "GET" })
  .inputValidator((d) => SymbolSchema.parse(d ?? {}))
  .handler(async ({ data }) => {
    const limit = data.limit ?? 30;
    const baseSym = data.symbol ? [data.symbol, data.symbol.replace(/\.JK$/i, "")] : null;

    let dq = supabaseAdmin.from("official_disclosures").select("*").order("published_at", { ascending: false }).limit(limit);
    let cq = supabaseAdmin.from("corporate_actions").select("*").order("announcement_date", { ascending: false, nullsFirst: false }).limit(limit);
    let rq = supabaseAdmin.from("regulatory_events").select("*").order("published_at", { ascending: false }).limit(limit);
    if (baseSym) { dq = dq.in("symbol", baseSym); cq = cq.in("symbol", baseSym); rq = rq.in("symbol", baseSym); }

    const [d, c, r] = await Promise.all([dq, cq, rq]);
    return {
      disclosures: d.data ?? [],
      corporateActions: c.data ?? [],
      regulatoryEvents: r.data ?? [],
    };
  });

/** Server helper (NOT a serverFn) — read-only disclosure context for an array of tickers. Used by AI app context + risk engine. */
export async function getDisclosureContextForSymbols(symbols: string[]) {
  if (!symbols.length) return {} as Record<string, any>;
  const bases = Array.from(new Set(symbols.flatMap(s => [s, s.replace(/\.JK$/i, "")])));
  const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
  const [d, c, r] = await Promise.all([
    supabaseAdmin.from("official_disclosures").select("*").in("symbol", bases).gte("published_at", since).order("published_at", { ascending: false }).limit(200),
    supabaseAdmin.from("corporate_actions").select("*").in("symbol", bases).order("announcement_date", { ascending: false, nullsFirst: false }).limit(200),
    supabaseAdmin.from("regulatory_events").select("*").in("symbol", bases).eq("status", "active").order("published_at", { ascending: false }).limit(200),
  ]);

  const out: Record<string, any> = {};
  for (const sym of symbols) {
    const base = sym.replace(/\.JK$/i, "");
    const keys = [sym, base];
    const disc = (d.data ?? []).find(x => keys.includes(x.symbol));
    const ca = (c.data ?? []).find(x => keys.includes(x.symbol));
    const reg = (r.data ?? []).find(x => keys.includes(x.symbol));
    out[sym] = {
      symbol: sym,
      latestDisclosure: disc ?? null,
      latestCorporateAction: ca ?? null,
      latestRegulatoryEvent: reg ?? null,
      disclosureImpactScore: disc?.impact_score ?? null,
      disclosureSentiment: disc?.sentiment ?? null,
      disclosureRiskFlags: disc?.risk_flags ?? reg?.risk_flags ?? ca?.risk_flags ?? [],
      freshness: classifyDisclosureFreshness(disc?.published_at ?? null),
      source: disc?.source ?? null,
    };
  }
  return out;
}

const DisclosureImport = z.object({
  symbol: z.string().min(1),
  title: z.string().min(1),
  disclosure_type: z.string().min(1),
  source: z.string().default("manual_import"),
  source_url: z.string().url().nullable().optional(),
  published_at: z.string().datetime().optional(),
  summary: z.string().nullable().optional(),
  raw_text: z.string().nullable().optional(),
  company_name: z.string().nullable().optional(),
  extracted_data: z.record(z.string(), z.any()).nullable().optional(),
});

export const importOfficialDisclosureFromJson = createServerFn({ method: "POST" })
  .inputValidator((d) => DisclosureImport.parse(d))
  .handler(async ({ data }) => {
    const cls = classifyDisclosureImpact({ disclosure_type: data.disclosure_type, title: data.title, summary: data.summary, raw_text: data.raw_text });
    const row = {
      symbol: data.symbol.replace(/\.JK$/i, ""),
      title: data.title,
      disclosure_type: cls.disclosureType,
      category: cls.category,
      source: data.source,
      url: data.source_url ?? null,
      published_at: data.published_at ?? new Date().toISOString(),
      received_at: new Date().toISOString(),
      summary: data.summary ?? null,
      raw_text: data.raw_text ?? null,
      extracted_data: data.extracted_data ?? null,
      company_name: data.company_name ?? null,
      impact_score: cls.impactScore,
      impact_level: cls.impactScore >= 70 ? "high" : cls.impactScore >= 40 ? "medium" : "low",
      sentiment: cls.sentiment,
      directness: cls.directness,
      trading_relevance: cls.tradingRelevance,
      is_high_impact: cls.isHighImpact,
      risk_flags: cls.riskFlags,
    };
    const { data: inserted, error } = await supabaseAdmin.from("official_disclosures").insert(row).select().single();
    if (error) throw new Error(error.message);
    return { ok: true, id: (inserted as any)?.id, classification: cls };
  });

const CorpActionImport = z.object({
  symbol: z.string().min(1),
  action_type: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  source: z.string().default("manual_import"),
  source_url: z.string().url().nullable().optional(),
  announcement_date: z.string().optional(),
  cum_date: z.string().nullable().optional(),
  ex_date: z.string().nullable().optional(),
  recording_date: z.string().nullable().optional(),
  payment_date: z.string().nullable().optional(),
  ratio: z.string().nullable().optional(),
  amount: z.number().nullable().optional(),
  company_name: z.string().nullable().optional(),
});

export const importCorporateActionFromJson = createServerFn({ method: "POST" })
  .inputValidator((d) => CorpActionImport.parse(d))
  .handler(async ({ data }) => {
    const cls = classifyCorporateActionImpact({ action_type: data.action_type, cum_date: data.cum_date, ex_date: data.ex_date, amount: data.amount });
    const row = {
      symbol: data.symbol.replace(/\.JK$/i, ""),
      action_type: data.action_type.toLowerCase(),
      title: data.title,
      description: data.description ?? null,
      announcement_date: data.announcement_date ?? new Date().toISOString().slice(0, 10),
      cum_date: data.cum_date ?? null,
      ex_date: data.ex_date ?? null,
      recording_date: data.recording_date ?? null,
      payment_date: data.payment_date ?? null,
      ratio: data.ratio ?? null,
      amount: data.amount ?? null,
      source: data.source,
      source_url: data.source_url ?? null,
      company_name: data.company_name ?? null,
      impact_score: cls.impactScore,
      sentiment: cls.sentiment,
      risk_flags: cls.riskFlags,
    };
    const { data: inserted, error } = await supabaseAdmin.from("corporate_actions").insert(row).select().single();
    if (error) throw new Error(error.message);
    return { ok: true, id: (inserted as any)?.id, classification: cls };
  });

const RegEventImport = z.object({
  symbol: z.string().min(1),
  event_type: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  source: z.string().default("manual_import"),
  source_url: z.string().url().nullable().optional(),
  published_at: z.string().datetime().optional(),
  company_name: z.string().nullable().optional(),
});

export const importRegulatoryEventFromJson = createServerFn({ method: "POST" })
  .inputValidator((d) => RegEventImport.parse(d))
  .handler(async ({ data }) => {
    const cls = classifyRegulatoryEventImpact({ event_type: data.event_type });
    const row = {
      symbol: data.symbol.replace(/\.JK$/i, ""),
      event_type: data.event_type.toUpperCase(),
      title: data.title,
      description: data.description ?? null,
      published_at: data.published_at ?? new Date().toISOString(),
      source: data.source,
      source_url: data.source_url ?? null,
      severity: cls.severity,
      impact_score: cls.impactScore,
      risk_flags: cls.riskFlags,
      company_name: data.company_name ?? null,
      status: "active",
    };
    const { data: inserted, error } = await supabaseAdmin.from("regulatory_events").insert(row).select().single();
    if (error) throw new Error(error.message);
    return { ok: true, id: (inserted as any)?.id, classification: cls };
  });
