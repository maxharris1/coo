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

All as MapLibre layers or HTML markers, so they zoom with the map, except the clouds:

- **Route:** the great-circle path from `interpolate`, sampled every 1% (every 0.2% above 300
  miles). Flown part: tomato `#F4623F`, 5 pt, round caps and joins, over an 8 pt ink casing. It
  ends under the bird. Still to go: ink dots, a 3.5 pt line with round caps and dash
  `[0.01, 2.2]`, so a dot about every 8 pt. The dots start one dot gap ahead of the bird. At
  night the dots are cream at 85%. The flown part is the same.
- **Pins:** `assets/svg/map/pin-loft.svg` at the origin, `pin-sill.svg` at the destination.
- **Pin pills:** each pin has a pill ("Your loft", or the recipient's label) beside it, level
  with the pin head and 4 pt from it. It sits on the side of the pin with more room, so it
  never covers the pin, and it stays 16 pt inside the map's edges. Cream fill, 2 pt ink outline,
  Nunito 900 at 12 px, padding 4 by 10, one line that ends in an ellipsis. The loft pill is at
  most 160 pt wide and the recipient's pill at most 180 pt. Either one shrinks further when
  its side has less room.
- **The bird:** an HTML marker holding the `<Bird>` component, 82 pt wide, flipped when the
  route heads west. While flying, `assets/svg/map/bird-shadow.svg` (night:
  `night/bird-shadow.svg`) sits 26 pt below the bird in the same marker. Other poses have no
  shadow. Its pose follows the tracker's state chip: `fly` (animated wings) while
  flying, `sleep` at the roost while roosting, `surprise` while delayed, `landed` on the
  destination pin once landed, and `perched` on the origin pin while scheduled. A pose change
  re-renders the marker in place and never remounts the map. Odd-job maps keep `fly` on the
  current leg. Later, the roost can sit on a small barn, water tower or tree illustration
  (chosen by hash of the flight id and the roost's index) and the delay on the statue or pretzel
  illustration. Those assets are not in the repo yet.
- **Speech bubble:** HTML and CSS in the bird's marker, above the bird and a little behind it.
  Cream fill, 2.5 pt ink outline, 14 pt corners, tilted -4 degrees, with the 14 x 12 tail
  `assets/svg/map/bubble-tail.svg` pointing at the bird. Caveat 700 at 22 px in ink, padding 6
  by 12, at most 190 pt wide: it wraps to two lines, then ends in an ellipsis. Its line comes
  from the flight log (`config/copy/flight-log.json`). It shows for 4 s about every 20 to 40 s,
  never while the user is dragging the map, and flips to the other side when the bird is within
  100 pt of a screen edge. Preview maps have no bubble.
- **Clouds:** three `assets/svg/map/cloud.svg` (night: `night/cloud.svg`), 74 x 36, in screen
  space rather than on the map: they sit just above the map canvas and below every marker, so
  a cloud can pass under the bird, a pin, a pill or the speech bubble but never over them, and
  panning the map does not move them. They show at zoom 11 and below and hide at street zoom
  (12 and up). Each drifts left to right across the whole screen at its own height (18%, 42%
  and 64% down), in 34, 46 and 40 s, starting spread out, and wraps back to the left edge.
  Under reduced motion they stay still at their resting spots, and they pause while the tab is
  hidden. Preview maps have no clouds.
- **Night:** when the sun is down at the bird's position (use `isDaylight` from the engine),
  switch to the night style and add a few `coo-twinkle` stars in the map's corners.


## The illustrated look (proposed, not live)

Fable's second pack (2026-11-23) turns the map into the look of the original mocks: green land,
ink-outlined water with squiggles, pines, mountains, round trees in parks, shop pills at street
zoom, a dark purple night, a dotted route ahead of the bird and a speech bubble. The full spec is
`reference/map/STYLE.md`; the original mocks are in `reference/map/mocks/` and everything is on
`reference/map/map-kit-sheet.png`.

| What | Where |
|---|---|
| Proposed day and night styles | `public/map/proposed/coo-day.style.json`, `coo-night.style.json`. Not used by any screen yet |
| Decoration sprite (1x, 2x) | `public/map/sprite/coo.json`, `coo.png`, `coo@2x.json`, `coo@2x.png` |
| Each decoration on its own, day and night | `assets/svg/map/`, `assets/svg/map/night/` (served from `public/assets/`) |
| Every colour for the regional, street and night looks | `assets/map/map-colours.json` |

The proposed styles point their `coo` sprite at `https://coo-pigeon.vercel.app/map/sprite/coo`.
MapLibre 6 rejects relative sprite URLs, so the screen that loads these styles must rewrite that
url to the page's own origin (for preview deploys) before handing the style to the map.

### Tile check (2026-11-23, OpenFreeMap planet 20261115)

Read from live tiles over New York, Williamsburg, the Adirondacks, rural Pennsylvania and
Colorado. The new layers' filters need these fixes before they draw what the spec wants:

- `mountain_peak` starts at zoom 7 on these tiles, not 5. Its `rank` is per tile, so New York
  hills get rank 1 at zoom 11. Filter to `class` `peak` (saddles also get rank 1 and 2) and
  consider a height floor on `ele`.
- `landcover` is absent at zooms 5 and 6 and is a few large merged polygons at zoom 7, so
  "one pine per polygon" gives about one pine per tile there. Pines start at 7 at the earliest.
- The `park` source layer holds protected areas, nature reserves and national parks only. City
  parks are `landcover` with `class` `grass` and `subclass` `park` (Central Park, McCarren Park).
  Round trees and the street-zoom park fill need that filter.
- `poi` `subclass` has `bakery`, `cafe`, `ice_cream`, `deli`, `books` and `pet`, but no `pizza`
  (pizza places are `restaurant` or `fast_food`). `poi` starts at zoom 11.
- Labels must stay in a font stack the glyph server has (`Noto Sans Bold`, `Italic`,
  `Regular`) until Nunito glyphs are built and served from this app.

`node src/app/dev/map/sample-tiles.ts` reruns the source-layer part of this check. It reads the
live TileJSON at `https://tiles.openfreemap.org/planet` and z3, z6, z9, z12 and z14 tiles over the
three `/dev/map` places, the Adirondacks and Colorado. It rewrites `sourceLayers` in
`src/app/dev/map/liberty-facts.json` with each source layer's fields (every `name:<lang>` folded
into `name:*`) and the `class` values seen in those tiles. It also writes
`src/app/dev/map/tile-samples.json` from the z3, z6, z9 and z12 tiles over the same five places,
plus New York at z11. For each decoration layer (`water-waves`, `woods-trees`, `mountains`,
`place`), place and zoom it keeps up to 20 features from the layer's source layer, each with its
geometry type and properties. When a tile has more, it sorts them by `rank` (unranked last), keeps
the first feature of each `class`, then fills up with the lowest ranks. CI never runs it.

The style tests in `src/app/dev/map/style.test.ts` pin the current style (no `poi` layers, token
colours, layer ids). The proposed style adds `poi` layers for park names and shop pills, which
changes the "no points of interest" rule above; the ticket that ships it updates the rule and the
tests together.

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
