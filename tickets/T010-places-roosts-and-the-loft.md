# T010. Places, roosts and the loft

Phase: 0 Foundation  
Depends on: T009

## Goal

People set where birds find them, and only a snapped roost is ever kept.

## Read first

- `docs/09-map.md (Places and names)`
- `docs/12-security-privacy.md (Location)`
- `docs/04-game-rules.md (4)`
- `docs/07-screens.md (Loft, Travel sheet)`

## Build

- The Photon adapter behind the `Geocoder` port, with `geo_cache`, concurrency 3 and 1 second timeouts. Read Photon's current docs first.
- `GET /api/geo/search`, `GET /api/geo/here`, `POST /api/loft`, `POST /api/loft/travel` as in docs/06. Search results are held server-side under a `placeId`; coordinates never go to the browser.
- Snapping happens in the handler before anything else touches the coordinates.
- The Loft onboarding screen with 'Use my location', search, the small map preview (a plain MapLibre map with the stock style is fine here) and 'Use my town centre instead'.
- Format labels: neighbourhood for the roost label; 'City, ST' in the US, 'City, Country' elsewhere.

## Done when

- [ ] Setting a loft from (40.71427, -73.96143) stores exactly (40.714, -73.9625), a neighbourhood label and a city with its centre. A spy on the database and the logger never sees the unsnapped numbers.
- [ ] The travel switch refuses a second change inside 12 hours and accepts one after.
- [ ] `/api/geo/search` returns no coordinates. An unknown `placeId` is `invalid`.
- [ ] With the geocoder failing, search answers with the 'Could not find that place' message and status 200 with an empty list.
- [ ] Search is limited to 30 a minute per user.
- [ ] Type check, lint and the whole test suite pass.
