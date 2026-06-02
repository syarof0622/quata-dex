DROP POLICY IF EXISTS anon_read_system_audit_reports ON public.system_audit_reports;
DROP POLICY IF EXISTS anon_read_system_audit_checks ON public.system_audit_checks;
REVOKE SELECT ON public.system_audit_reports FROM anon;
REVOKE SELECT ON public.system_audit_checks FROM anon;