-- Position Exit Plans table for AI Position Management Engine
CREATE TABLE IF NOT EXISTS public.position_exit_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  position_id uuid,
  symbol text NOT NULL,
  agent_id uuid,
  strategy_name text,
  entry_price numeric,
  avg_entry numeric,
  current_price numeric,
  quantity numeric,
  lot numeric,
  stop_loss numeric,
  take_profit numeric,
  trailing_stop numeric,
  trailing_stop_pct numeric,
  highest_price_since_entry numeric,
  risk_reward_ratio numeric,
  max_loss_amount numeric,
  target_profit_amount numeric,
  exit_condition text,
  hold_condition text,
  reduce_condition text,
  invalidation_level numeric,
  management_status text NOT NULL DEFAULT 'HOLDING',
  confidence numeric NOT NULL DEFAULT 0,
  reason text,
  warnings text[] NOT NULL DEFAULT '{}',
  last_evaluated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_position_exit_plans_account_symbol
  ON public.position_exit_plans (account_id, symbol);

CREATE INDEX IF NOT EXISTS idx_position_exit_plans_agent
  ON public.position_exit_plans (agent_id);

CREATE INDEX IF NOT EXISTS idx_position_exit_plans_status
  ON public.position_exit_plans (management_status);

GRANT SELECT ON public.position_exit_plans TO authenticated;
GRANT ALL ON public.position_exit_plans TO service_role;

ALTER TABLE public.position_exit_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_position_exit_plans"
  ON public.position_exit_plans FOR SELECT TO authenticated USING (true);

CREATE POLICY "deny_public_write_position_exit_plans"
  ON public.position_exit_plans FOR ALL TO public USING (false) WITH CHECK (false);

CREATE TRIGGER trg_position_exit_plans_updated
  BEFORE UPDATE ON public.position_exit_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Position monitoring snapshots (per worker tick) for history/replay
CREATE TABLE IF NOT EXISTS public.position_monitoring_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  position_id uuid,
  symbol text NOT NULL,
  agent_id uuid,
  current_price numeric,
  unrealized_pnl numeric,
  unrealized_pnl_pct numeric,
  hold_score numeric,
  exit_score numeric,
  reduce_score numeric,
  action text,
  management_status text,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  market_session text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_position_monitoring_account_symbol_created
  ON public.position_monitoring_snapshots (account_id, symbol, created_at DESC);

GRANT SELECT ON public.position_monitoring_snapshots TO authenticated;
GRANT ALL ON public.position_monitoring_snapshots TO service_role;
ALTER TABLE public.position_monitoring_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_position_monitoring"
  ON public.position_monitoring_snapshots FOR SELECT TO authenticated USING (true);

CREATE POLICY "deny_public_write_position_monitoring"
  ON public.position_monitoring_snapshots FOR ALL TO public USING (false) WITH CHECK (false);