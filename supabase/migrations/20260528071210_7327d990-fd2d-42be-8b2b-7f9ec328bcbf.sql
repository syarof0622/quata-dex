DROP POLICY IF EXISTS "audit_reports_admin_all" ON public.system_audit_reports;
DROP POLICY IF EXISTS "audit_checks_admin_all" ON public.system_audit_checks;

REVOKE INSERT, UPDATE, DELETE ON public.system_audit_reports FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.system_audit_checks FROM authenticated, anon;

CREATE POLICY "auth_read_system_audit_reports"
ON public.system_audit_reports
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "anon_read_system_audit_reports"
ON public.system_audit_reports
FOR SELECT TO anon
USING (true);

CREATE POLICY "auth_read_system_audit_checks"
ON public.system_audit_checks
FOR SELECT TO authenticated
USING (true);

CREATE POLICY "anon_read_system_audit_checks"
ON public.system_audit_checks
FOR SELECT TO anon
USING (true);