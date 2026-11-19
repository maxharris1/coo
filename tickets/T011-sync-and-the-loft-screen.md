# T011. Sync and the loft screen

Phase: 0 Foundation  
Depends on: T010

## Goal

The signed-in app shell and its home screen, fed by one endpoint.

## Read first

- `docs/06-api.md (Sync, Shared shapes)`
- `docs/07-screens.md (Shell, Main)`

## Looks like

- `reference/screens/png/Main.png` (and the `.html` beside it in `html/`)

## Build

- `GET /api/sync` returning the shape in docs/06 (flights, visits and the rest may be empty arrays for now). Birds carry computed care and `canFly`.
- The `(app)` layout: sync provider (load, focus, every 20 seconds while visible), server time offset, toasts, the tab bar.
- The Main screen from real data: greeting by time of day, flock rows with status line and chip, 'Feed me' (calls a stub until T033), perches, link to More.
- `lib/format.ts`: times, durations, distances (miles, blocks, kilometres), pronoun tokens, copy templates.

## Done when

- [ ] Sync as Max returns his two birds and nothing of Priya's.
- [ ] The provider refetches on window focus and on the interval, and not while the tab is hidden (fake timers).
- [ ] Format: 6480000 ms → '1h 48m'; 14000 → '14 sec'; 0.15 mi → '3 blocks'; 81.4 mi → '81 miles'; kilometres when units is km.
- [ ] Main matches `reference/screens/png/Main.png` with equivalent data, and looks right with one bird and with five.
- [ ] Type check, lint and the whole test suite pass.
