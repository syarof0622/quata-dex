// Server function wrappers for Portfolio Intelligence + Scenarios.
// Thin createServerFn shims around server-only engines so UI and AI
// context can call them via RPC.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  calculatePortfolioHealth,
  generatePortfolioInsights,
  snapshotPortfolioIntelligence,
} from "./portfolio-intelligence.server";
import {
  runPortfolioScenario,
  type ScenarioInput,
} from "./portfolio-scenarios.server";

export const getPortfolioHealth = createServerFn({ method: "GET" }).handler(
  async () => {
    const { health } = await calculatePortfolioHealth();
    // Fire-and-forget snapshot so System Health card stays fresh.
    snapshotPortfolioIntelligence().catch((e) =>
      console.error("[portfolio-intel] snapshot failed:", e?.message ?? e),
    );
    return health;
  },
);

export const getPortfolioInsights = createServerFn({ method: "GET" }).handler(
  async () => {
    return generatePortfolioInsights();
  },
);

export const snapshotPortfolioHealth = createServerFn({ method: "POST" }).handler(
  async () => {
    return snapshotPortfolioIntelligence();
  },
);

const scenarioSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("IHSG_DOWN_2") }),
  z.object({ type: z.literal("IHSG_DOWN_5") }),
  z.object({ type: z.literal("IHSG_DOWN_10") }),
  z.object({ type: z.literal("IHSG_UP_2") }),
  z.object({
    type: z.literal("SECTOR_DROP"),
    sector: z.string().min(1).max(64),
    movePct: z.number().min(-50).max(50),
  }),
  z.object({ type: z.literal("CLOSE_POSITION"), symbol: z.string().min(1).max(16) }),
  z.object({
    type: z.literal("REDUCE_POSITION"),
    symbol: z.string().min(1).max(16),
    reducePct: z.number().min(1).max(100),
  }),
  z.object({
    type: z.literal("ADD_POSITION"),
    symbol: z.string().min(1).max(16),
    amount: z.number().min(1).max(1_000_000_000),
  }),
  z.object({
    type: z.literal("DEPLOY_CASH"),
    deployPct: z.number().min(1).max(100),
    targetSymbols: z.array(z.string().min(1).max(16)).max(20).optional(),
  }),
  z.object({ type: z.literal("CASH_TO_50") }),
  z.object({
    type: z.literal("CUSTOM_PRICE_MOVE"),
    symbol: z.string().min(1).max(16),
    movePct: z.number().min(-50).max(50),
  }),
]);

export const runScenario = createServerFn({ method: "POST" })
  .inputValidator((data: ScenarioInput) => scenarioSchema.parse(data) as ScenarioInput)
  .handler(async ({ data }) => {
    return runPortfolioScenario(data);
  });
