# T021. The Flights screen

Phase: 1 The core loop  
Depends on: T020

## Goal

One list of every bird in the air, coming in, and recently landed.

## Read first

- `docs/07-screens.md (Flights)`
- `docs/06-api.md (GET /api/flights)`

## Looks like

- `reference/screens/png/Flights.png` (and the `.html` beside it in `html/`)

## Build

- `GET /api/flights` with paging.
- The Flights screen with its sections, live status lines from the plans, and rows that open the tracker.

## Done when

- [ ] With three of my flights out, one incoming and two landed today, the sections hold the right rows in the right order.
- [ ] Status lines update as the fake clock moves (flying → delayed → landed).
- [ ] Paging returns older flights without repeats.
- [ ] The screen matches `reference/screens/png/Flights.png`.
- [ ] Type check, lint and the whole test suite pass.
