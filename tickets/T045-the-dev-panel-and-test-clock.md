# T045. The dev panel and test clock

Phase: 5 Settings, safety and polish  
Depends on: T022

## Goal

Skip two days in two taps, so the slow parts of a slow app can be tested.

## Read first

- `docs/06-api.md (Internal)`
- `docs/07-screens.md (Dev panel)`
- `docs/02-architecture.md (Time)`

## Build

- `POST /api/dev/clock` and `/api/dev/grant`, and the `/dev` page. All refuse in production.
- 'Jump to next landing' finds my earliest flying flight and sets the clock one second past its arrival, then runs the tick.

## Done when

- [ ] Every dev route returns `not_found` when `APP_ENV=production`.
- [ ] Adding an hour moves `serverNow` by an hour and trackers jump accordingly.
- [ ] Jump to next landing lands exactly one flight when one is due first.
- [ ] Type check, lint and the whole test suite pass.
