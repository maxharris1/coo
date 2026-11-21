-- Before applying, store coo_tick_url, coo_cron_secret and coo_vercel_protection_bypass in Supabase Vault, as docs/deploy.md shows.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'coo-tick',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'coo_tick_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'coo_cron_secret'),
      'x-vercel-protection-bypass', (select decrypted_secret from vault.decrypted_secrets where name = 'coo_vercel_protection_bypass')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);

select cron.schedule('coo-prune-events', '17 * * * *', $$ delete from public.events where created_at < now() - interval '1 day' $$);
