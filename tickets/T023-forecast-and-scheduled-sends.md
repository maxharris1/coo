# T023. Forecast and scheduled sends

Phase: 1 The core loop  
Depends on: T022

## Goal

Pick a better hour, or let the app release the bird for you.

## Read first

- `docs/07-screens.md (Forecast)`
- `docs/04-game-rules.md (5)`
- `docs/06-api.md (quote; tick step 1; cancel)`

## Looks like

- `reference/screens/png/Forecast.png` (and the `.html` beside it in `html/`)

## Build

- The Forecast screen from the quote endpoint: hour chips, odds or 'Roosts', factors, sunset line, the two buttons.
- `releaseAt` on `POST /api/flights` (up to 24 hours ahead): stores a `scheduled` flight and reserves the bird.
- Tick step 1. `POST /api/flights/[id]/cancel`. The tracker's scheduled state.

## Done when

- [ ] Scenario 5 of docs/13.
- [ ] A time more than 24 hours ahead or in the past is `invalid`.
- [ ] An hour whose flight would not arrive before sunset is marked `roostsOvernight`.
- [ ] The released flight's `departAtMs` equals the scheduled time even if the tick ran late.
- [ ] The screen matches `reference/screens/png/Forecast.png`.
- [ ] Type check, lint and the whole test suite pass.
