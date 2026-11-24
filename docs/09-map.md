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
- **Style:** our own illustrated style JSON, served from `public/map/coo-day.style.json` by day
  and `public/map/coo-night.style.json` by night. It reads the same tiles, glyphs and default
  sprite as the stock style, adds our decoration sprite (`public/map/sprite/coo`) and repaints
  everything in the colours of `assets/map/map-colours.json`. The loft picker (`PinMap`) stays
  on the stock style.
- **Loading:** every flight map (tracker, flight previews, job tracker, guest page) and
  `/dev/map` load the style through `loadMapStyle(path)` in `src/components/mapStyle.ts`. It
  fetches the JSON and makes each sprite url that starts with `/` absolute against
  `window.location.origin`, because MapLibre 6 rejects relative sprite urls. If our style cannot
  be fetched, `MapView` falls back to the stock style so the flight still shows.
- **Attribution:** see "Attribution" below. This is a licence requirement.

## The style

`public/map/coo-day.style.json` is the illustrated look from `reference/map/STYLE.md`, built
from Fable's proposed style and fixed against the live tiles (see the tile check below). It has
28 layers. Its `sources` and `glyphs` equal `src/app/dev/map/liberty-facts.json`, and its
`sprite` is two sprites: `default` (the stock Liberty sprite) and `coo`
(`/map/sprite/coo`, made absolute by `loadMapStyle`).

Three looks:

- **Regional (zoom 12 and below):** flat green land (woods and grass at half strength from zoom 8
  to 11, so small patches don't mottle it; full strength at 7 and below and from 13), pale-blue water with an ink outline and the
  `coo:wave-pattern` squiggle tile on sea, lakes and ponds (not rivers or pools), ink-outlined
  blue rivers from zoom 8, a pine (`coo:tree-pine`) on each wood from zoom 7 to 13, a mountain
  (`coo:mountain`) on each `mountain_peak` with `class` `peak`, `ele` of 500 m or more and
  `rank` 1 (the top peak of each tile) below zoom 10 or `rank` 1 or 2 from 10, up to zoom 12,
  never overlapping and 48 pt apart, dashed state borders up to zoom 11, white city dots
  (`coo:city-dot-major` for `class` `city`, `coo:city-dot` otherwise) beside place names, and
  state and province names in spaced capitals up to zoom 8.
- **Street (zoom 14 and up):** butter-yellow blocks (the built-up fill, with building edges as
  ink at 30%) between cream streets with ink casings, city parks (`landcover` `grass` /
  `park`) in green with a 2 pt ink outline and, from zoom 16, one round tree
  (`coo:tree-round`) each (earlier they sprinkled every pocket park), street names in capitals
  from 15, park names from 15, and shop pills from 15.5.
- **Protected areas** (`park` source layer) are tinted only from zoom 12, and only the classes
  that read as a park (`national_park`, `nature_reserve`, `regional_park`, `State Park`, `Park`),
  with a round tree each from 14 and no outline. Public lands, forests, game lands, refuges and
  generic `protected_area`s are never tinted: at regional zooms they covered whole regions (the
  Adirondacks, the Pinelands, BLM land) in mint, which read like the stock map.
- **Between 12 and 14** the built-up and park colours blend from regional to street with
  `interpolate` on zoom.

Night (`public/map/coo-night.style.json`) is generated, never edited: run
`node src/app/dev/map/night.ts`. It takes the day file and swaps in the values in
`assets/map/coo-night.overrides.json`; `ROLES` in `night.ts` says which day property each value
replaces, and `DAY_ONLY` lists the few that stay (the shop pill keeps its cream pill and ink
words). The overrides are the `night` colours of `assets/map/map-colours.json`: land `#4A4380`,
woods `#525884`, parks `#566186`, built-up `#5B548D` blending to blocks `#605A91`, water and
rivers `#2C2752`, cream water, river and park lines at 75% (the water fill's own edge too, as
`rgba(255,244,220,0.75)`), water names at 50% like the day style, roads `#726B99` on `#2C2752`
casings, cream borders at 50%, cream labels on a `#4A4380` halo with state names at 72%, and
every decoration swapped for its `-night` sprite icon. `night.test.ts` checks the committed file
equals the derived output.

### Keep it sparse

The regional mocks show almost no roads, so:

- No roads below zoom 8. From 8 only motorways, thin (casing under 2 pt at 8, 3 pt by 10.5).
  Trunks and primaries join between 10.5 and 11. Streets (secondary, tertiary, minor) from 13.
  No service roads, paths, tracks or tunnels.
- Place names thin out by class: cities at every zoom below 8; from 8 to 10 only cities and
  towns of `rank` 8 or less (the bigger ones), towns not before 9; every city and town from 11;
  villages and suburbs from 12, neighbourhoods from 13, none from 15. Countries only below
  zoom 5, states and provinces up to 8.
- Built-up areas from zoom 9, fading in to full strength by 11.

Points of interest are allowed for exactly two things: park names (`poi` `class` `park`) and
generic shop pills. A shop pill is the `coo:place-pill` icon stretched round a fixed UPPERCASE
word chosen by `subclass`, never the shop's name: COFFEE (`cafe`), BAKERY (`bakery`), ICE CREAM
(`ice_cream`), DELI (`deli`), BOOKS (`books`) and PETS (`pet`), 60 pt apart. No other POIs, no
transit, no house numbers, no airports, no 3D.

### Labels

Labels stay in the fonts the glyph server has (`Noto Sans Bold`, `Italic`, `Regular`) until
Nunito glyphs are built and served from this app. State names: Bold capitals, letter spacing
0.22 em, 10 to 12 pt, ink at 50%. Sea and lake names: Italic capitals, 0.3 em, ink at 50%. City
names: Bold as written, 11 to 13 pt, ink, beside their dot. Street names: Bold capitals, 0.08
em. Every label that sits on the map keeps a cream halo (`#4A4380` at night).

### Attribution

The map credit ("OpenFreeMap © OpenMapTiles Data from OpenStreetMap") comes from the tiles and
is shown by MapLibre's compact attribution control. It is a licence requirement (OpenStreetMap
ODbL, OpenMapTiles CC-BY), so it is never hidden or removed. Following the OSMF attribution
guidelines for interactive maps, the credit is open in full when the map first draws and folds
to a small (i) button after 5 seconds or on the first pan, zoom or tap, whichever comes first
(`collapseAttributionSoon` in `src/components/attribution.ts`). Tapping (i) reopens it, and once
a reader has opened it nothing folds it again; a day/night style swap does not reopen or fold
it. The control is restyled in `MapView.module.css` as a small cream card with a thin ink
outline, a 44 pt tap target round the (i), and a visible keyboard focus ring. `MapView` lifts
the bottom map controls by its `controlsBottom` (the height of the card over the map: the
tracker and the job tracker pass their card height), so the credit sits just above the card, in
the corner the camera keeps clear of the bird. This is separate from `bottomPadding`, the
camera padding, so the guest page's 24 px padding leaves its credit at the bottom edge.
`/dev/map` shows the credit open all the time.

Preview maps (the flights list and odd-job cards) sit inside a link and cannot be panned, so
their credit stays open and never folds (`keepCreditOpen`): a tap on it neither toggles (i) nor
follows the card's link, while the credit's own links still open. Screen readers keep the
credit everywhere: a preview hides only MapLibre's canvas container (the map picture and its
markers) with `aria-hidden`, and the guest page names that same container as its `role="img"`
picture (`mapLabel`), so the credit is never inside a hidden or image element.

`/dev/map?flight=1` renders the real tracker (map, header and bottom card) on a fixed fake flight,
Brooklyn to Philadelphia, without the API, so the credit can be checked against the card's real
height. `?progress=0..1` sets how far the bird has flown (default 0.4), `?night=1` forces night
and `?preview=1` shows the flights-list preview instead.

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
  switch to the night style. `MapView` loads it through `loadMapStyle` and swaps it in with
  `setStyle`, so the route layers are re-added on `style.load` and the pins and bird stay put
  without a remount. A style that arrives after the sun is back up is dropped. Stars and a
  cross-fade are not built yet.


## The illustrated look

Fable's second pack (2026-11-23) turns the map into the look of the original mocks: green land,
ink-outlined water with squiggles, pines, mountains, round trees in parks, shop pills at street
zoom, a dark purple night, a dotted route ahead of the bird and a speech bubble. The full spec is
`reference/map/STYLE.md`; the original mocks are in `reference/map/mocks/` and everything is on
`reference/map/map-kit-sheet.png`.

| What | Where |
|---|---|
| Day and night styles | `public/map/coo-day.style.json`, `coo-night.style.json` (see "The style") |
| Decoration sprite (1x, 2x) | `public/map/sprite/coo.json`, `coo.png`, `coo@2x.json`, `coo@2x.png` |
| Each decoration on its own, day and night | `assets/svg/map/`, `assets/svg/map/night/` (served from `public/assets/`) |
| Every colour for the regional, street and night looks | `assets/map/map-colours.json` |

The styles point their `coo` sprite at `/map/sprite/coo`; `loadMapStyle` makes it absolute
against the page's own origin, so preview deploys load their own sprite.

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

The style tests in `src/app/dev/map/style.test.ts` pin the shipped style: the stock sources,
glyphs and sprite, source layers, fields and class values that exist in `liberty-facts.json`,
font stacks the glyph server has, the `map-colours.json` colours and their 12 to 14 blend, the
zooms each layer starts at, the sparse road and place rules, and the two allowed `poi` uses.
They also run each decoration layer's filter through MapLibre's `featureFilter` over
`tile-samples.json`: pines match the Adirondack woods at z9, mountains match the Colorado peaks at
z9 (never saddles), squiggles match the sea off Cape Cod at z6 (not rivers), New York gets the
big city dot, round trees match New York's city parks, and no mountain matches Manhattan's hills
at z11 or z12. The samples have no `poi` layer and no z14 tiles, so shop pills and street-zoom
parks are not checked against live tiles yet (a `todo` test marks the gap). Those tiles cannot
be fetched from the build container (no network to the tile server), so that check is done by
eye in a browser on `/dev/map` at Williamsburg-like zooms until the samples are refreshed from a
machine that can reach the tiles.

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
