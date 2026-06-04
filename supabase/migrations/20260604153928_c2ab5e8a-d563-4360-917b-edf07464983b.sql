
-- 1) symbol_trade_cooldowns
CREATE TABLE IF NOT EXISTS public.symbol_trade_cooldowns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  user_id uuid NOT NULL,
  symbol text NOT NULL,
  reason text,
  loss_count integer NOT NULL DEFAULT 0,
  last_loss_at timestamptz,
  cooldown_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, symbol)
);
GRANT SELECT ON public.symbol_trade_cooldowns TO authenticated;
GRANT ALL ON public.symbol_trade_cooldowns TO service_role;
ALTER TABLE public.symbol_trade_cooldowns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read_cooldowns" ON public.symbol_trade_cooldowns
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "deny_public_write_cooldowns" ON public.symbol_trade_cooldowns
  FOR ALL USING (false) WITH CHECK (false);
CREATE INDEX IF NOT EXISTS idx_cooldowns_agent_symbol ON public.symbol_trade_cooldowns(agent_id, symbol);
CREATE INDEX IF NOT EXISTS idx_cooldowns_until ON public.symbol_trade_cooldowns(cooldown_until);

-- 2) strategy_health
CREATE TABLE IF NOT EXISTS public.strategy_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  user_id uuid NOT NULL,
  strategy text NOT NULL,
  trades integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  losses integer NOT NULL DEFAULT 0,
  consec_losses integer NOT NULL DEFAULT 0,
  gross_profit numeric NOT NULL DEFAULT 0,
  gross_loss numeric NOT NULL DEFAULT 0,
  avg_return numeric NOT NULL DEFAULT 0,
  profit_factor numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ACTIVE',
  paused_reason text,
  paused_at timestamptz,
  last_trade_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (agent_id, strategy)
);
GRANT SELECT ON public.strategy_health TO authenticated;
GRANT ALL ON public.strategy_health TO service_role;
ALTER TABLE public.strategy_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_read_strategy_health" ON public.strategy_health
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "deny_public_write_strategy_health" ON public.strategy_health
  FOR ALL USING (false) WITH CHECK (false);
CREATE INDEX IF NOT EXISTS idx_strategy_health_agent ON public.strategy_health(agent_id);

-- 3) Extend ai_trade_agents with loss-protection knobs + diagnostic status
ALTER TABLE public.ai_trade_agents
  ADD COLUMN IF NOT EXISTS min_trade_quality_score numeric NOT NULL DEFAULT 75,
  ADD COLUMN IF NOT EXISTS min_risk_reward numeric NOT NULL DEFAULT 2.0,
  ADD COLUMN IF NOT EXISTS min_hold_minutes integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS strategy_kill_switch_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS symbol_cooldown_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS overtrading_guard_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS risk_off_filter_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS max_consecutive_losses integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS max_trades_per_symbol_per_day integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_daily_loss_pct numeric NOT NULL DEFAULT 0.01,
  ADD COLUMN IF NOT EXISTS max_portfolio_drawdown_pct numeric NOT NULL DEFAULT 0.05,
  ADD COLUMN IF NOT EXISTS min_profit_factor_threshold numeric NOT NULL DEFAULT 0.8,
  ADD COLUMN IF NOT EXISTS min_win_rate_threshold numeric NOT NULL DEFAULT 0.35,
  ADD COLUMN IF NOT EXISTS protection_mode_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS protection_mode_reason text,
  ADD COLUMN IF NOT EXISTS diagnostic_status text NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN IF NOT EXISTS diagnostic_summary jsonb,
  ADD COLUMN IF NOT EXISTS diagnostic_updated_at timestamptz;

-- 4) Extend ai_trade_reviews with richer post-trade fields
ALTER TABLE public.ai_trade_reviews
  ADD COLUMN IF NOT EXISTS mistake_category text,
  ADD COLUMN IF NOT EXISTS trade_quality_score numeric,
  ADD COLUMN IF NOT EXISTS recommended_adjustment text,
  ADD COLUMN IF NOT EXISTS market_regime text,
  ADD COLUMN IF NOT EXISTS strategy text,
  ADD COLUMN IF NOT EXISTS exit_reason text,
  ADD COLUMN IF NOT EXISTS entry_reason text;

-- 5) updated_at triggers
DROP TRIGGER IF EXISTS trg_cooldowns_updated_at ON public.symbol_trade_cooldowns;
CREATE TRIGGER trg_cooldowns_updated_at
  BEFORE UPDATE ON public.symbol_trade_cooldowns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS trg_strategy_health_updated_at ON public.strategy_health;
CREATE TRIGGER trg_strategy_health_updated_at
  BEFORE UPDATE ON public.strategy_health
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
