# T046. End-to-end journeys

Phase: 5 Settings, safety and polish  
Depends on: T045, T044

## Goal

The six journeys run in a real browser from sign-up to reply.

## Read first

- `docs/13-testing.md (End-to-end journeys)`

## Build

- Playwright set up against a local server with `APP_ENV=test`, PGlite or a disposable Postgres, the fakes, and the dev clock.
- The six journeys in docs/13 as tests, at an iPhone-sized viewport.
- `npm run e2e` and a short `docs/testing-howto.md`.

## Done when

- [ ] All six journeys pass three times in a row.
- [ ] Each journey saves a screenshot of every screen it visits for a person to look through.
- [ ] Type check, lint and the whole test suite pass.
