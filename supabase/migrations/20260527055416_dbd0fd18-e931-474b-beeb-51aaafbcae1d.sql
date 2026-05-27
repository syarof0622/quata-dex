CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule('fundamentals-cron');
EXCEPTION WHEN OTHERS THEN
  NULL;
END$$;

SELECT cron.schedule(
  'fundamentals-cron',
  '0 10 * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--d8169012-9e91-4d10-8dff-bfee5f2eba72.lovable.app/api/public/cron/fundamentals?limit=25',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', 'Y1CGGGL5j62CbncRZQZOw2NVG2RaIIALil9f5M16rQl6TyhAB1WaqIWs-V-8eQpT'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cron$
);