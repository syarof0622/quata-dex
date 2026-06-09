
CREATE TABLE public.ai_tool_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  conversation_id text,
  question text,
  intent text,
  tool_name text NOT NULL,
  tool_input jsonb,
  tool_output_summary text,
  status text,
  data_state text,
  confidence_score numeric,
  duration_ms integer,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_tool_runs TO authenticated;
GRANT ALL ON public.ai_tool_runs TO service_role;
ALTER TABLE public.ai_tool_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_tool_runs_owner_or_admin_read" ON public.ai_tool_runs
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "ai_tool_runs_no_client_write" ON public.ai_tool_runs
  FOR ALL TO authenticated USING (false) WITH CHECK (false);
CREATE INDEX idx_ai_tool_runs_user_created ON public.ai_tool_runs (user_id, created_at DESC);
CREATE INDEX idx_ai_tool_runs_conversation ON public.ai_tool_runs (conversation_id, created_at DESC);
