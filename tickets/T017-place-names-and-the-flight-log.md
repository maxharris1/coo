# T017. Place names and the flight log

Phase: 1 The core loop  
Depends on: T016, T010

## Goal

The tracker says where the bird is and tells small true jokes about the trip.

## Read first

- `docs/09-map.md (Places and names)`
- `docs/05-flight-engine.md (Step 6)`
- `docs/14-content-voice.md`

## Looks like

- `reference/screens/png/Flight.png` (and the `.html` beside it in `html/`)

## Build

- At release, look up the eleven decile points and each event's position (2 second total budget, before the transaction) and store `flights.place_names`, including `dest` city, region and country.
- Headline: nearest decile's name → '{bird} is over {place}'; fall back to 'on the way to {friend}'.
- Flight log component: events whose time has passed, newest first, lines chosen by `pick` from `config/copy/flight-log.json`, the weather group chosen from the stored input and gear, tokens filled.
- Altitude and roost names chosen by hash from short lists.

## Done when

- [ ] With the fake geocoder, a New York to Philadelphia flight stores eleven decile names and a `dest`.
- [ ] With the geocoder down the send succeeds and the headline uses the fallback.
- [ ] The log for the Chicago vector at arrival contains takeoff, dusk, sunrise and landing lines in time order and no line with an unfilled `{token}`.
- [ ] A rainy flight with goggles uses the `_geared` rain line.
- [ ] Type check, lint and the whole test suite pass.
