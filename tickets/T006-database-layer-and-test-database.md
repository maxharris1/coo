# T006. Database layer and test database

Phase: 0 Foundation  
Depends on: T001

## Goal

A small typed way to talk to Postgres that works the same in production and in tests.

## Read first

- `docs/02-architecture.md (Database access)`
- `docs/03-data-model.md`

## Build

- `src/server/db.ts`: the `Db` interface and a `pg` Pool adapter (max 5, no named prepared statements, `tx` with BEGIN/COMMIT/ROLLBACK and nested calls joining the outer transaction).
- `src/test/testDb.ts`: a PGlite adapter with the same interface, loading `supabase/test/auth-stub.sql` then every migration in order except those that need Supabase-only extensions (`0002_cron.sql`).
- Port `supabase/test/schema.test.mjs` to vitest using `testDb()`.
- `src/test/seedWorld.ts` as described in docs/13.
- Row mappers from snake_case rows to the camelCase types in docs/06.

## Done when

- [ ] The nine schema tests pass under vitest.
- [ ] `tx` rolls back on a thrown error and commits otherwise; a nested `tx` does not commit early.
- [ ] `seedWorld()` produces Max, Priya and Rosa with lofts, birds, a closet and friendships; a test reads them back.
- [ ] Type check, lint and the whole test suite pass.
