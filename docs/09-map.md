# 09. The map

## What it must do

- Show a real, accurate map of the world in the sticker-book style.
- Zoom continuously from one block to the whole country with no change of screen.
- Follow a bird along its route, in daylight and at night.

## How

- **Renderer:** MapLibre GL JS, loaded only on screens that show a map (dynamic import, no
  server rendering).
- **Tiles:** OpenFreeMap's public vector tiles, which use OpenStreetMap data in the OpenMapTiles
  layer schema. No key, no sign-up. Their stock style is at
  `https://tiles.openfreemap.org/styles/liberty`.
- **Style:** our own style JSON, served from `public/map/coo-day.style.json`. It points at the
  same tile source as the stock style and repaints the layers in our tokens.
- **Attribution:** keep MapLibre's attribution control visible (compact form is fine). The text
  is in `config/app.json` → `mapAttribution`. This is a licence requirement.

## The style: what exists and what is left

`assets/map/coo-day.style.json` is a **starter**: 16 layers (land, urban, green, park, water,
shoreline, river, building, street, road, border, labels) in the right colours, as drawn on the
MapStyle sheet. It has **not** been tested against live tiles. Ticket T048 finishes it:

1. Fetch the stock style JSON. Copy its `sources`, `glyphs` and `sprite` values into ours. The
   values in the starter were written from memory and may be wrong.
2. Check each of our layers' `source-layer` and filters against the stock style's layers of the
   same purpose. Fix any that draw nothing.
3. Set every text layer's font to a font stack the glyph server actually has (the stock style
   lists them). Nunito on the map would need our own glyph files; do not attempt that now.
4. Check at zooms 3, 6, 9, 12, 15 and 17 over New York, a rural area and a coast.
   Adjust until it matches the MapStyle sheet and the three tracker mocks.
5. Build the night style: the same file with the colour changes in
   `assets/map/coo-night.overrides.json` (land `--coo-night`, water `--coo-night-water`, labels pale).

Maputnik (a free browser editor for these styles) makes this quick.

Until T048 is done, the tracker may use the stock style so that other work is not blocked.

## Style rules

| Feature | Day | Notes |
|---|---|---|
| Land | paper `#FFF4DC` | |
| Water | sky `#A9DDF7`, ink shoreline 1.5 px | |
| Parks, green | mint `#86D9A0` at 60% | |
| Built-up areas | sand `#E9E3D0` | zoom 9 and up |
| Buildings | card `#FFFBF0` with ink 1 px outline | zoom 15 and up |
| Major roads | card fill with ink casing | thicker as you zoom in |
| Streets | card, thin casing | zoom 13 and up |
| State borders | ink, dashed | |
| Labels | ink with a card halo | cities by rank; street names from zoom 15 |

Keep it sparse. No points of interest, no transit, no building numbers, no 3D.

## What we draw on top

All as MapLibre layers or HTML markers, so they zoom with the map:

- **Route:** the great-circle path from `interpolate`, sampled every 1% (every 0.2% above 300
  miles). Flown part: solid tomato, 4 px with ink casing. Remaining part: ink dashes, animated
  with `coo-march` if drawn as SVG, static otherwise.
- **Pins:** `assets/svg/map/pin-loft.svg` at the origin, `pin-sill.svg` at the destination,
  with a short label chip.
- **The bird:** an HTML marker holding the `<Bird>` component, about 56 px, flipped when the
  route heads west. Its pose follows the tracker's state chip: `fly` (animated wings) while
  flying, `sleep` at the roost while roosting, `surprise` while delayed, `landed` on the
  destination pin once landed, and `perched` on the origin pin while scheduled. A pose change
  re-renders the marker in place and never remounts the map. Odd-job maps keep `fly` on the
  current leg. Later, the roost can sit on a small barn, water tower or tree illustration
  (chosen by hash of the flight id and the roost's index) and the delay on the statue or pretzel
  illustration. Those assets are not in the repo yet.
- **Thought bubble:** now and then a small bubble above the bird with a short line.
- **Night:** when the sun is down at the bird's position (use `isDaylight` from the engine),
  switch to the night style and add a few `coo-twinkle` stars in the map's corners.

## Odd jobs on the map

A bird on an odd job flies from its loft to the job's stored destination and straight back. The
job map reuses the same map, pins and bird marker as a flight, with two legs instead of one plan:

- `jobLegs(loft, dest, started_at, ends_at)` in `src/lib/game/jobDest.ts` builds both legs.
  The out leg flies loft → destination from `started_at` to the midpoint. The back leg flies
  destination → loft from the midpoint to `ends_at`. The midpoint is halfway between the two
  times, rounded down to the millisecond.
- Each leg is a `FlightPlan` with one `fly` segment from 0 to 1 and `arriveAtMs` at the leg's
  end. There are no roosts, no delays, no weather and no flight-log events, and the engine's
  `computeFlightPlan` is not used. `positionAt` moves the bird along a leg at a steady speed.
- `legAt(legs, now)` gives the out leg before the midpoint and the back leg from the midpoint on.
  At the midpoint the bird is at the destination and already flying home. There is no
  `waiting` gap and no 30-minute sill wait. At `ends_at` it is landed at the loft.
- The loft pin keeps the loft label and the destination pin keeps the job's label on both legs.
  Both points are grid-snapped before they are stored, so the pins never show an exact spot.

## Camera

- Position the bird marker every animation frame from `positionAt`. Do not move the map every frame.
- On opening: fit the whole route with padding (top 80, sides 48, bottom = height of the card).
- Then follow: every 5 seconds, if the bird is nearer than 20% of the view to an edge, ease the
  map so the bird is centred a little behind its direction of travel.
- Default zoom by distance still to fly: under 1 mile → 16; under 5 → 14; under 30 → 11;
  under 150 → 8; under 600 → 6; otherwise 4.5. Ease between them as the bird gets closer, so a
  long flight ends at street level on the friend's block.
- The user may pan and zoom freely. After that, stop following and show a small "Find {bird}"
  button that returns to following.
- Limits: zoom 3 to 17. No rotation, no tilt.

## Places and names

`Geocoder` port, default adapter Photon (`https://photon.komoot.io`, free, built on
OpenStreetMap, no key; fair use only):

- `search(q)` → `/api?q=...&limit=6&lang=en`
- `reverse(lat, lon)` → `/reverse?lat=...&lon=...`

Confirm these paths and the response fields against Photon's current documentation when writing
the adapter. Cache every answer in `geo_cache`: searches for a day, reverse lookups for 30 days,
one entry per point rounded to 0.05° (0.002° for flights under 3 miles). The key is a hash of
that rounded point, never the coordinates themselves. Limit ourselves to 3
requests at a time and 3 second timeouts. If Photon is slow or down: searches say "The map is
slow to answer right now. Try again in a moment.", an address hit whose name lookup fails is named
from the search's own area, and names along a route are simply left out.

Used for:

- Loft and guest destinations: search, then snap, then label ("Fishtown, Philadelphia").
- Roost labels: the reverse lookup's neighbourhood or suburb, then city.
- City centre for city-level sharing: search for "{city}, {region}, {country}" and take the top result.
- Names along a route: at release, look up the 11 points at each tenth of the route and the
  position of each flight-log event, with a 2 second budget in total. Store in `flights.place_names`.
  Format: "Edison, NJ" in the US (city plus state code), "City, Country" elsewhere.

For more than a few hundred users, host Photon ourselves or pay for a geocoder. The port makes
that a one-file change. This is in `docs/15-open-items.md`.

## Weather

`Weather` port, default adapter Open-Meteo (`https://api.open-meteo.com/v1/forecast`, no key).
Ask for current and hourly `temperature_2m`, `precipitation`, `snowfall`, `wind_speed_10m`,
`wind_direction_10m` with `temperature_unit=fahrenheit`, `wind_speed_unit=mph`,
`precipitation_unit=mm`, `forecast_days=2`, `timezone=UTC`. Several coordinates can be sent in one
request as comma-separated lists. Confirm against their current documentation.

Map to `WeatherSample`: `windMph`, `windFromDeg`, `tempF`, `precipMmH` = precipitation for the
hour, `snow` = snowfall above zero. Cache by 0.1° cell and hour for 10 minutes.
On failure use the fallback in `config/game.json` and add the log line "The weather office is
closed. Assuming fine."

Open-Meteo's free service is for non-commercial use and asks for attribution
(`config/app.json` → `weatherAttribution`, shown in Settings). A paid plan is needed if Coo ever
makes money. Also in `docs/15-open-items.md`.
