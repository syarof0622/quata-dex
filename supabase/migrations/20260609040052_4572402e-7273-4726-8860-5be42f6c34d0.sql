CREATE TABLE public.error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NULL,
  level text NOT NULL DEFAULT 'error',
  source text NOT NULL,
  module text NULL,
  action text NULL,
  message text NOT NULL,
  stack text NULL,
  path text NULL,
  user_agent text NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  fingerprint text NULL,
  handled boolean NOT NULL DEFAULT false,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT error_logs_level_check CHECK (level IN ('debug','info','warning','error','fatal')),
  CONSTRAINT error_logs_source_check CHECK (source IN ('browser','server','api','server_function','worker','database','ai_gateway','unknown'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.error_logs TO authenticated;
GRANT ALL ON public.error_logs TO service_role;

ALTER TABLE public.error_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own error logs"
ON public.error_logs
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "Users can create their own error logs"
ON public.error_logs
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "Admins can update error logs"
ON public.error_logs
FOR UPDATE
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Admins can delete error logs"
ON public.error_logs
FOR DELETE
TO authenticated
USING (public.is_admin(auth.uid()));

CREATE INDEX error_logs_created_at_idx ON public.error_logs (created_at DESC);
CREATE INDEX error_logs_user_id_created_at_idx ON public.error_logs (user_id, created_at DESC);
CREATE INDEX error_logs_source_created_at_idx ON public.error_logs (source, created_at DESC);
CREATE INDEX error_logs_fingerprint_idx ON public.error_logs (fingerprint);