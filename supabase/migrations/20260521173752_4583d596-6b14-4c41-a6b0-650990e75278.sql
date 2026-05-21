ALTER TABLE public.ai_trade_agents
  ADD COLUMN IF NOT EXISTS last_market_session_state text;

ALTER TABLE public.paper_orders
  ADD COLUMN IF NOT EXISTS agent_id uuid;

CREATE INDEX IF NOT EXISTS idx_paper_orders_agent_id
  ON public.paper_orders(agent_id);

ALTER TABLE public.ai_agent_training_events
  ADD COLUMN IF NOT EXISTS event_type text,
  ADD COLUMN IF NOT EXISTS close_reason text;

CREATE INDEX IF NOT EXISTS idx_ai_training_events_agent_event
  ON public.ai_agent_training_events(agent_id, event_type);
