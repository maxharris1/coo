# Deploy

This covers only the minute tick. T047 completes the rest of this document.

## Before you start

- The Supabase project and the Vercel project exist.
- Migrations `0001_init.sql`, `0003_notifications_push_held_until.sql` and `0004_tick_health.sql` are applied. `0004_tick_health.sql` creates the table that the tick writes and `/api/health` reads.

## 1. Set the cron secret in Vercel

In the Vercel project settings, add the environment variable `CRON_SECRET`. Use a long random value. Redeploy so the app sees it.

## 2. Create the Vercel bypass secret

Production is behind Vercel Authentication. Without a bypass, Supabase gets 401 from Vercel before the app runs.

In the Vercel project settings, open Deployment Protection. Create a "Protection Bypass for Automation" secret. Vercel gives it to deployments as `VERCEL_AUTOMATION_BYPASS_SECRET`. Copy the value.

## 3. Store three secrets in Supabase Vault

Open the Supabase SQL editor. Run each line with your own values:

```sql
select vault.create_secret('<tick url>', 'coo_tick_url');
select vault.create_secret('<CRON_SECRET value>', 'coo_cron_secret');
select vault.create_secret('<bypass secret>', 'coo_vercel_protection_bypass');
```

- `coo_tick_url` is the production address of `/api/cron/tick`, for example `https://<app>/api/cron/tick`. Add no query string.
- `coo_cron_secret` is the same value as `CRON_SECRET` in Vercel.
- `coo_vercel_protection_bypass` is the secret from step 2.

## 4. Apply the cron migration last

If `0004_tick_health.sql` is not applied yet, apply it now.

Then apply `0002_cron.sql`. Apply it last because the job it schedules calls the app within a minute, and the app writes `tick_health`.

## 5. Check it works

Check that both jobs exist:

```sql
select jobid, jobname, schedule, active from cron.job;
```

You should see `coo-tick` and `coo-prune-events`, both active.

After a minute or two, check the recent runs:

```sql
select jobname, status, return_message, start_time
from cron.job_run_details
join cron.job using (jobid)
order by start_time desc
limit 5;
```

The status should be `succeeded`. This only means the request was sent.

Check what the app answered:

```sql
select id, status_code, timed_out, error_msg, created
from net._http_response
order by created desc
limit 5;
```

The status code should be 200. A 401 means `coo_cron_secret` does not match `CRON_SECRET`, or the bypass secret is wrong. pg_net keeps responses for 6 hours.

Then check the app itself:

```sh
curl -H "x-vercel-protection-bypass: $BYPASS" https://<app>/api/health
```

It returns `lastTickAt`, `ageMs`, `stale` and `serverNow`. `stale` should be `false`. Check again over 10 minutes. `stale` should stay `false`. It turns `true` when there has been no good tick for over 5 minutes.

## Change a secret

To change a secret in Vault, run this with its name and the new value:

```sql
select vault.update_secret(
  (select id from vault.secrets where name = '<name>'),
  '<new value>'
);
```

The next run uses the new value. You do not need to reschedule.

`coo_cron_secret` and `CRON_SECRET` in Vercel are one value. The app checks `CRON_SECRET`, so change both, in this order:

1. Set the new `CRON_SECRET` in Vercel.
2. Redeploy.
3. When the new deployment is live, run the query above for `coo_cron_secret` right away.

Ticks between the redeploy and the Vault update get 401. `/api/health` turns stale only after 5 minutes without a good tick.

`coo_vercel_protection_bypass` must match the "Protection Bypass for Automation" secret in Vercel Deployment Protection. If you create a new bypass secret there, update `coo_vercel_protection_bypass` in Vault with it.

`coo_tick_url` lives only in Vault. Update it when the production address changes.

After a change, re-run the `net._http_response` query from step 5. The status code should be 200, not 401. Then run the `/api/health` check from step 5. `stale` should be `false`.

## Stop the tick

```sql
select cron.unschedule('coo-tick');
```

To start it again, re-run `0002_cron.sql`. That is safe. `cron.schedule` replaces a job with the same name, and the extensions are only created if missing.
