# T048. Finish the map style

Phase: 5 Settings, safety and polish  
Depends on: T016

## Goal

The real map looks like it belongs in the sticker book, day and night, at every zoom.

## Read first

- `docs/09-map.md (The style, Style rules)`

## Looks like

- `reference/sheets/png/MapStyle.png` (and the `.html` beside it in `html/`)
- `reference/screens/png/Flight.png` (and the `.html` beside it in `html/`)
- `reference/screens/png/FlightBlock.png` (and the `.html` beside it in `html/`)
- `reference/screens/png/FlightLong.png` (and the `.html` beside it in `html/`)

## Build

- Do the five steps in docs/09 'The style: what exists and what is left'.
- Produce `public/map/coo-day.style.json` and `coo-night.style.json`.
- A `/dev/map` page with buttons for the six test zooms over New York, rural Pennsylvania and Cape Cod, day and night.

## Done when

- [ ] Both styles load with no MapLibre errors or missing-layer warnings in the console.
- [ ] At each test zoom and place the map shows land, water, parks, roads and labels in the token colours.
- [ ] Screenshots of `/dev/map` at the six zooms, day and night, are attached for a person to approve against `reference/sheets/png/MapStyle.png`.
- [ ] Attribution is visible.
- [ ] Type check, lint and the whole test suite pass.

## Notes

- This ticket can be done any time after T016. It needs a person's eye at the end.
