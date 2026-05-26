ALTER TABLE public.ai_trade_agents
  ADD COLUMN IF NOT EXISTS automation_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_worker_run_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_worker_status text,
  ADD COLUMN IF NOT EXISTS last_worker_message text,
  ADD COLUMN IF NOT EXISTS last_auto_decision_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_auto_execution_at timestamptz,
  ADD COLUMN IF NOT EXISTS next_expected_worker_run_at timestamptz,
  ADD COLUMN IF NOT EXISTS worker_error_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_blocked_reason text;