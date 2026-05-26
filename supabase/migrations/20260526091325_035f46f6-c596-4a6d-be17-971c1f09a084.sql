
-- 1) system_audit_logs
CREATE TABLE IF NOT EXISTS public.system_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module text NOT NULL,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  status text NOT NULL DEFAULT 'info',
  message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_audit_logs_created_at
  ON public.system_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_audit_logs_module_status
  ON public.system_audit_logs (module, status, created_at DESC);

ALTER TABLE public.system_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auth_read_system_audit_logs ON public.system_audit_logs;
CREATE POLICY auth_read_system_audit_logs
  ON public.system_audit_logs FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS deny_public_write_system_audit_logs ON public.system_audit_logs;
CREATE POLICY deny_public_write_system_audit_logs
  ON public.system_audit_logs FOR ALL
  TO public
  USING (false) WITH CHECK (false);

-- 2) decision replay snapshot on ai_agent_decisions
ALTER TABLE public.ai_agent_decisions
  ADD COLUMN IF NOT EXISTS decision_replay_snapshot jsonb;
