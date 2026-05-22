ALTER TABLE public.ai_trade_agents
  ADD COLUMN IF NOT EXISTS momentum_hunter_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS momentum_min_change_pct numeric NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS momentum_min_rvol numeric NOT NULL DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS momentum_min_score numeric NOT NULL DEFAULT 70,
  ADD COLUMN IF NOT EXISTS momentum_max_allocation_pct numeric NOT NULL DEFAULT 0.03,
  ADD COLUMN IF NOT EXISTS momentum_extended_allocation_pct numeric NOT NULL DEFAULT 0.015;