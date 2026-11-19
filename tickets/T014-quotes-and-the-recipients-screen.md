# T014. Quotes and the Recipients screen

Phase: 1 The core loop  
Depends on: T012, T013, T004

## Goal

Before sending, people see who they can reach, how far and how long.

## Read first

- `docs/06-api.md (Sending: quote)`
- `docs/04-game-rules.md (3, 4, 5)`
- `docs/07-screens.md (Recipients)`

## Looks like

- `reference/screens/png/Recipients.png` (and the `.html` beside it in `html/`)

## Build

- `flights.quote` service and `POST /api/flights/quote`: endpoints by the privacy rule, weather for each requested time, hazards with `hazardsFor`, the bird's care at that time, the engine, and the `factors` list computed by running the engine with and without each factor.
- The Recipients screen: sill birds first, friends with a quick browser-side estimate (engine with calm weather and my fastest ready bird), multi-select with the running count, 'Someone new', and the contact button only where `navigator.contacts` exists.

## Done when

- [ ] Quote Max→Priya with the fake weather calm: distance about 82.1, duration about 1 h 49.5 min, odds 0.91; with the band, 0.94.
- [ ] With a 14 mph south-west wind the quote has a headwind factor whose effect is about '+18 min'.
- [ ] With rain, a hawk day and a fair day (search forward with `hazardsFor` for a weekend date where both are true and set the fake clock to it) the factors list has three odds entries that sum to the odds difference.
- [ ] Quoting a non-friend is `forbidden`. Quoting with someone else's bird is `not_found`.
- [ ] A friend at city level is quoted to the city centre.
- [ ] The screen matches `reference/screens/png/Recipients.png`; Next is disabled when more people are picked than birds are ready.
- [ ] Type check, lint and the whole test suite pass.
