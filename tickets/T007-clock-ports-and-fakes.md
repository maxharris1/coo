# T007. Clock, ports and fakes

Phase: 0 Foundation  
Depends on: T006

## Goal

The seams that make everything testable: time and the four outside services.

## Read first

- `docs/02-architecture.md (Rules of the layering, Time)`
- `docs/13-testing.md (Fakes)`

## Build

- `src/server/clock.ts`: `now()` = system time plus `dev_clock.offset_ms`, with the offset forced to zero when `APP_ENV` is production. Cache the offset for 5 seconds.
- Interfaces in `src/server/ports/`: `Weather`, `Geocoder`, `Push`, `Sms`. Shapes follow docs/09 and docs/10.
- Fakes in `src/test/`: `FakeClock`, `FakeWeather`, `FakeGeocoder`, `FakePush`, `FakeSms`.
- `makeDeps()` for production and `makeTestDeps()` for tests, returning `{ db, clock, weather, geocoder, push, sms, config }`.
- `AppError` and the error-to-HTTP mapping from docs/06. A `handler()` wrapper for route handlers: builds deps, parses the body with a zod schema, calls the service, adds `serverNow`, maps errors, checks `Origin` on writes.
- `rateLimit(db, key, limit, windowSeconds)` on the `rate_limits` table.
- An eslint rule or test that forbids `Date.now()` and `new Date()` without arguments under `src/server/` except in `clock.ts`.

## Done when

- [ ] `FakeClock.advance` moves `now()`. The production clock ignores a non-zero offset in production mode.
- [ ] The wrapper returns the error shape and status for each code in docs/06, and `internal` with no detail for an unknown throw.
- [ ] A write with a foreign `Origin` header is refused.
- [ ] `rateLimit` allows `limit` calls in a window and refuses the next; a new window allows again.
- [ ] The forbidden-time check fails on a deliberately bad fixture.
- [ ] Type check, lint and the whole test suite pass.
