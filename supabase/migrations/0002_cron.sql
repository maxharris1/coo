-- Coo: the once-a-minute tick, run by Supabase (pg_cron + pg_net).
-- NOT covered by the automated schema test: these extensions only exist on Supabase.
-- Before applying, store two secrets in Supabase Vault:
--   select vault.create_secret('https://YOUR-APP-DOMAIN/api/cron/tick', 'coo_tick_url');
--   select vault.create_secret('THE-SAME-VALUE-AS-CRON_SECRET', 'coo_cron_secret');
-- Check the current Supabase Cron docs when you apply this; the function names below are from
-- the documentation at the time of writing.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'coo-tick',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'coo_tick_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'coo_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);

select cron.schedule('coo-prune-events', '17 * * * *', $$ delete from public.events where created_at < now() - interval '1 day' $$);
