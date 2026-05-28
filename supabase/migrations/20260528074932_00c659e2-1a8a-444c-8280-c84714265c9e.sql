DO $$ BEGIN
  PERFORM cron.unschedule('ai-trade-agent-tick');
EXCEPTION WHEN OTHERS THEN NULL; END $$;