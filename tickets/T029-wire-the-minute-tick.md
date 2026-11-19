# T029. Wire the minute tick

Phase: 2 Install and notifications  
Depends on: T020, T022

## Goal

The world moves forward every minute without anyone opening the app.

## Read first

- `docs/02-architecture.md (Moving the world forward)`
- `supabase/migrations/0002_cron.sql`
- `docs/15-open-items.md`

## Build

- Read the current Supabase docs for Cron, `pg_net` and Vault, and correct `0002_cron.sql` if names have changed.
- The tick returns counts per step and the time taken, and stops cleanly at 20 seconds.
- A `GET /api/health` that reports the age of the last successful tick (store it in a one-row table added by a new migration).
- Write `docs/deploy.md`: the exact steps a person takes to set the Vault secrets and apply the migration.

## Done when

- [ ] With 120 due flights, one tick lands 50 and the next two land the rest; none twice.
- [ ] A step that throws for one row does not stop the other rows or the other steps; the error is logged with the row id.
- [ ] Health reports `stale: true` when the last tick is over 5 minutes old.
- [ ] Applied to a real Supabase project by a person: the job appears in the cron job list and `/api/health` stays fresh for 10 minutes (record in the summary).
- [ ] Type check, lint and the whole test suite pass.
