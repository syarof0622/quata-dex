-- Deny INSERT/UPDATE/DELETE for the public (anon) role on read-only data tables.
-- Server functions use the service-role admin client, which bypasses RLS.
DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'news_articles','news_cache','news_price_alignment','news_sources',
    'ticker_sentiment_summary','signals_cache',
    'serpapi_usage_logs','serpapi_usage_summary',
    'ai_agent_risk_logs','ai_agent_performance',
    'ai_agent_training_events','ai_agent_decisions'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('DROP POLICY IF EXISTS deny_public_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS deny_public_update ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS deny_public_delete ON public.%I', t);
    EXECUTE format('CREATE POLICY deny_public_insert ON public.%I FOR INSERT TO public WITH CHECK (false)', t);
    EXECUTE format('CREATE POLICY deny_public_update ON public.%I FOR UPDATE TO public USING (false) WITH CHECK (false)', t);
    EXECUTE format('CREATE POLICY deny_public_delete ON public.%I FOR DELETE TO public USING (false)', t);
  END LOOP;
END $$;