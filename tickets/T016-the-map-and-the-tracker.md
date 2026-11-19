# T016. The map and the tracker

Phase: 1 The core loop  
Depends on: T015, T003

## Goal

Watch a bird cross a real map at any scale, day or night.

## Read first

- `docs/09-map.md`
- `docs/07-screens.md (Flight)`
- `docs/05-flight-engine.md (Using the plan)`

## Looks like

- `reference/screens/png/Flight.png` (and the `.html` beside it in `html/`)
- `reference/screens/png/FlightBlock.png` (and the `.html` beside it in `html/`)
- `reference/screens/png/FlightLong.png` (and the `.html` beside it in `html/`)
- `reference/sheets/png/MapStyle.png` (and the `.html` beside it in `html/`)

## Build

- `<MapView>`: MapLibre loaded on the client only, our style (the stock OpenFreeMap style is acceptable until T048), attribution visible, zoom 3–17, no rotation.
- Route layers (flown and remaining), pins, the bird marker positioned every frame from `positionAt` with server-corrected time, flipped when heading west, roost and delay props, night style when the sun is down at the bird.
- The camera rules in docs/09, including 'Find {bird}' after the user moves the map.
- The tracker card: chip, headline, progress, the three stats for flying and for roosting, for my flights and incoming ones.
- `GET /api/flights/[id]`.

## Done when

- [ ] A unit test of the camera's zoom-for-distance function at each threshold.
- [ ] A component test with a fake clock: at 50% of a calm vector the card shows about half the miles and the right 'Lands in'.
- [ ] For the Chicago vector at 2 am the state is Roosting, the stats switch to 'Takes off again' with the roost segment's end time, and the night style is requested.
- [ ] For the block vector, seconds are shown.
- [ ] Someone who is neither owner nor counterpart gets `not_found`.
- [ ] By eye against `Flight.png`, `FlightBlock.png` and `FlightLong.png`: layout of the card, the bird on the route, pins and labels.
- [ ] Type check, lint and the whole test suite pass.
