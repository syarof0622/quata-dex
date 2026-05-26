
ALTER TABLE public.ai_trade_agents
  ADD COLUMN IF NOT EXISTS risk_per_trade_pct numeric NOT NULL DEFAULT 0.01,
  ADD COLUMN IF NOT EXISTS atr_stop_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS atr_stop_multiplier numeric NOT NULL DEFAULT 1.5,
  ADD COLUMN IF NOT EXISTS volatility_sizing_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS correlation_risk_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS liquidity_risk_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS news_shock_risk_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS circuit_breaker_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS max_sector_exposure_pct numeric NOT NULL DEFAULT 0.40,
  ADD COLUMN IF NOT EXISTS max_position_weight_pct numeric NOT NULL DEFAULT 0.25,
  ADD COLUMN IF NOT EXISTS min_cash_buffer_pct numeric NOT NULL DEFAULT 0.05,
  ADD COLUMN IF NOT EXISTS max_losses_per_day integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS consecutive_losses integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS risk_paused_until timestamptz,
  ADD COLUMN IF NOT EXISTS risk_pause_reason text,
  ADD COLUMN IF NOT EXISTS last_risk_evaluation jsonb;
