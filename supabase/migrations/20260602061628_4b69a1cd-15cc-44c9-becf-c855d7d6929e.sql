CREATE TABLE IF NOT EXISTS public.fundamental_source_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  symbol text NOT NULL,
  source text NOT NULL,
  attempt_time timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL,
  http_status integer,
  error_code text,
  error_message text,
  freshness_detected timestamptz,
  payload_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.fundamental_source_logs TO authenticated;
GRANT ALL ON public.fundamental_source_logs TO service_role;

ALTER TABLE public.fundamental_source_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_fundamental_source_logs"
ON public.fundamental_source_logs FOR SELECT
TO authenticated USING (true);

CREATE POLICY "deny_public_write_fundamental_source_logs"
ON public.fundamental_source_logs FOR ALL
USING (false) WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_fsl_symbol_time
  ON public.fundamental_source_logs (symbol, attempt_time DESC);
CREATE INDEX IF NOT EXISTS idx_fsl_source_time
  ON public.fundamental_source_logs (source, attempt_time DESC);