
-- Tighten read access on AI agent telemetry tables.
-- Previously these were readable by the public (unauthenticated) role; restrict to authenticated only.
DROP POLICY IF EXISTS read_ai_decisions ON public.ai_agent_decisions;
DROP POLICY IF EXISTS read_ai_perf ON public.ai_agent_performance;
DROP POLICY IF EXISTS read_ai_risk ON public.ai_agent_risk_logs;
DROP POLICY IF EXISTS read_ai_training ON public.ai_agent_training_events;

CREATE POLICY auth_read_ai_decisions ON public.ai_agent_decisions
  FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_read_ai_perf ON public.ai_agent_performance
  FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_read_ai_risk ON public.ai_agent_risk_logs
  FOR SELECT TO authenticated USING (true);
CREATE POLICY auth_read_ai_training ON public.ai_agent_training_events
  FOR SELECT TO authenticated USING (true);
