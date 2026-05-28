CREATE TABLE IF NOT EXISTS public.system_audit_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  overall_score numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'unknown',
  critical_issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  passed_checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  failed_checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  modules jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommended_fixes jsonb NOT NULL DEFAULT '[]'::jsonb,
  auto_fix_available jsonb NOT NULL DEFAULT '[]'::jsonb,
  duration_ms integer,
  error_message text,
  trigger_source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_audit_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_audit_reports TO anon;
GRANT ALL ON public.system_audit_reports TO service_role;

ALTER TABLE public.system_audit_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_reports_admin_all"
ON public.system_audit_reports
FOR ALL
TO public
USING (true)
WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_system_audit_reports_created_at
  ON public.system_audit_reports (created_at DESC);

CREATE TABLE IF NOT EXISTS public.system_audit_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audit_report_id uuid REFERENCES public.system_audit_reports(id) ON DELETE CASCADE,
  module text NOT NULL,
  check_key text NOT NULL,
  status text NOT NULL DEFAULT 'unknown',
  severity text NOT NULL DEFAULT 'info',
  message text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  recommended_fix text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_audit_checks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_audit_checks TO anon;
GRANT ALL ON public.system_audit_checks TO service_role;

ALTER TABLE public.system_audit_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_checks_admin_all"
ON public.system_audit_checks
FOR ALL
TO public
USING (true)
WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_system_audit_checks_report
  ON public.system_audit_checks (audit_report_id);
CREATE INDEX IF NOT EXISTS idx_system_audit_checks_module
  ON public.system_audit_checks (module);