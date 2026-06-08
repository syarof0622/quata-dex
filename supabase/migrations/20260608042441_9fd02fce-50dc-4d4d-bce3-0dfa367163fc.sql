
-- Drop overly-permissive SELECT policies
DROP POLICY IF EXISTS auth_read_ai_conf_cal_logs ON public.ai_confidence_calibration_logs;
DROP POLICY IF EXISTS auth_read_ai_trade_reviews ON public.ai_trade_reviews;
DROP POLICY IF EXISTS "auth read internal_audit_runs" ON public.internal_audit_runs;
DROP POLICY IF EXISTS auth_read_portfolio_risk ON public.portfolio_risk_snapshots;
DROP POLICY IF EXISTS auth_read_position_monitoring ON public.position_monitoring_snapshots;
DROP POLICY IF EXISTS auth_read_strategy_health ON public.strategy_health;
DROP POLICY IF EXISTS auth_read_cooldowns ON public.symbol_trade_cooldowns;
DROP POLICY IF EXISTS auth_read_system_audit_checks ON public.system_audit_checks;
DROP POLICY IF EXISTS auth_read_system_audit_logs ON public.system_audit_logs;
DROP POLICY IF EXISTS auth_read_system_audit_reports ON public.system_audit_reports;
DROP POLICY IF EXISTS auth_read_disclosure_runs ON public.disclosure_pipeline_runs;
DROP POLICY IF EXISTS auth_read_news_pipeline_runs ON public.news_pipeline_runs;
DROP POLICY IF EXISTS auth_read_serpapi_logs ON public.serpapi_usage_logs;
DROP POLICY IF EXISTS auth_read_serpapi_summary ON public.serpapi_usage_summary;
DROP POLICY IF EXISTS "auth read source_health_logs" ON public.source_health_logs;

-- Owner-scoped SELECT policies for user trading data
CREATE POLICY ai_conf_cal_logs_owner_or_admin_read ON public.ai_confidence_calibration_logs
  FOR SELECT TO authenticated
  USING (agent_id IN (SELECT id FROM public.ai_trade_agents WHERE user_id = auth.uid()) OR public.is_admin(auth.uid()));

CREATE POLICY ai_trade_reviews_owner_or_admin_read ON public.ai_trade_reviews
  FOR SELECT TO authenticated
  USING (agent_id IN (SELECT id FROM public.ai_trade_agents WHERE user_id = auth.uid()) OR public.is_admin(auth.uid()));

CREATE POLICY position_monitoring_owner_or_admin_read ON public.position_monitoring_snapshots
  FOR SELECT TO authenticated
  USING (account_id IN (SELECT id FROM public.paper_accounts WHERE user_id = auth.uid()) OR public.is_admin(auth.uid()));

-- Admin-only SELECT for internal/system tables
CREATE POLICY internal_audit_runs_admin_read ON public.internal_audit_runs
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY system_audit_checks_admin_read ON public.system_audit_checks
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY system_audit_logs_admin_read ON public.system_audit_logs
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY system_audit_reports_admin_read ON public.system_audit_reports
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY disclosure_pipeline_runs_admin_read ON public.disclosure_pipeline_runs
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY news_pipeline_runs_admin_read ON public.news_pipeline_runs
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY serpapi_usage_logs_admin_read ON public.serpapi_usage_logs
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY serpapi_usage_summary_admin_read ON public.serpapi_usage_summary
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY source_health_logs_admin_read ON public.source_health_logs
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- Position exit plans: add fallback by account_id when agent_id is null
DROP POLICY IF EXISTS position_exit_plans_owner_or_admin_all ON public.position_exit_plans;
CREATE POLICY position_exit_plans_owner_or_admin_all ON public.position_exit_plans
  FOR ALL TO authenticated
  USING (
    (agent_id IS NOT NULL AND agent_id IN (SELECT id FROM public.ai_trade_agents WHERE user_id = auth.uid()))
    OR (account_id IN (SELECT id FROM public.paper_accounts WHERE user_id = auth.uid()))
    OR public.is_admin(auth.uid())
  )
  WITH CHECK (
    (agent_id IS NOT NULL AND agent_id IN (SELECT id FROM public.ai_trade_agents WHERE user_id = auth.uid()))
    OR (account_id IN (SELECT id FROM public.paper_accounts WHERE user_id = auth.uid()))
    OR public.is_admin(auth.uid())
  );
