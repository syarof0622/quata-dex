-- 1. swing_trade_plans
CREATE TABLE IF NOT EXISTS public.swing_trade_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  paper_account_id uuid NOT NULL,
  position_id uuid,
  symbol text NOT NULL,
  entry_type text NOT NULL,
  entry_price numeric,
  entry_zone_low numeric,
  entry_zone_high numeric,
  stop_loss numeric,
  take_profit_1 numeric,
  take_profit_2 numeric,
  trailing_stop numeric,
  trailing_active boolean NOT NULL DEFAULT false,
  invalidation_level numeric,
  risk_reward_ratio numeric,
  swing_quality_score numeric,
  target_holding_days integer NOT NULL DEFAULT 3,
  max_holding_days integer NOT NULL DEFAULT 7,
  min_holding_until timestamptz,
  time_stop_at timestamptz,
  status text NOT NULL DEFAULT 'PLANNED',
  reasons text[] NOT NULL DEFAULT '{}',
  warnings text[] NOT NULL DEFAULT '{}',
  blocked_reason text,
  market_regime text,
  strategy text,
  decision_id uuid,
  closed_at timestamptz,
  realized_pnl numeric,
  realized_pnl_pct numeric,
  exit_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_swing_plans_agent_symbol ON public.swing_trade_plans (agent_id, symbol);
CREATE INDEX IF NOT EXISTS idx_swing_plans_status ON public.swing_trade_plans (status);
CREATE INDEX IF NOT EXISTS idx_swing_plans_position ON public.swing_trade_plans (position_id);
CREATE INDEX IF NOT EXISTS idx_swing_plans_created_at ON public.swing_trade_plans (created_at DESC);

GRANT SELECT ON public.swing_trade_plans TO authenticated;
GRANT ALL ON public.swing_trade_plans TO service_role;

ALTER TABLE public.swing_trade_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY auth_read_swing_trade_plans
  ON public.swing_trade_plans FOR SELECT
  TO authenticated USING (true);

CREATE POLICY deny_public_write_swing_trade_plans
  ON public.swing_trade_plans FOR ALL
  TO public USING (false) WITH CHECK (false);

CREATE TRIGGER update_swing_trade_plans_updated_at
  BEFORE UPDATE ON public.swing_trade_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. ai_trade_agents new columns for swing_max
ALTER TABLE public.ai_trade_agents
  ADD COLUMN IF NOT EXISTS swing_mode_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS swing_protection_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS swing_protection_reason text,
  ADD COLUMN IF NOT EXISTS swing_protection_until timestamptz,
  ADD COLUMN IF NOT EXISTS target_holding_days integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS max_holding_days integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS time_stop_warning_days integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS max_trades_per_symbol_per_week integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_correlated_sector_entries_per_day integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS swing_quality_threshold numeric NOT NULL DEFAULT 78,
  ADD COLUMN IF NOT EXISTS swing_min_hold_minutes integer NOT NULL DEFAULT 1440;