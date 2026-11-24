# Flight map: the illustrated look

How to make the live tile map look like the original mocks: flat green land, ink-outlined water,
little trees and mountains, squiggles on the sea, spaced-out state names, a speech bubble from
the bird, and a dark purple night.

The map stays a real MapLibre map on OpenStreetMap tiles. Nothing is hand-placed. The look comes
from three things: a repainted style, a small sprite of decorations the style places by rule, and
a few things drawn over the map in screen space (clouds, stars, the bird, bubbles, pins).

Files in this folder:

| File | What | Where it goes |
|---|---|---|
| `style/coo-day.style.json`, `style/coo-night.style.json` | Proposed styles | `public/map/`, replacing the current two |
| `sprite/coo.json`, `coo.png`, `coo@2x.json`, `coo@2x.png` | Decoration sprite | `public/map/sprite/` |
| `svg/*.svg`, `svg/night/*.svg` | Each decoration on its own | `public/assets/svg/map/` (sources for the sprite, and for the screen-space pieces) |
| `tokens/map-colours.json` | Every colour for the three looks | `config/` or wherever map tokens live |
| `mocks/` | The original mock maps as SVG, and the three tracker screens | reference only |
| `map-kit-sheet.png` | Everything at a glance | reference only |

**What was checked:** both style files pass the MapLibre style validator. They were built from
the app's current styles by repainting those layers and adding new ones, so the road, water and
label layers that work today are untouched in structure.
**What was not:** nobody has looked at them over live tiles. Layer filters for the new layers
(`landcover` wood, `park`, `mountain_peak`, `poi` subclasses) follow the OpenMapTiles schema from
memory. Check each new layer in the map inspector and fix filters that match nothing.
The sprite url in the style must be absolute: replace `YOUR-DOMAIN`.

## 1. Three looks

| Look | When | Feel |
|---|---|---|
| Regional | zoom 12 and below | States, rivers, cities as dots. Green land, pines, mountains, squiggly sea |
| Street | zoom 14 and above | Butter-yellow blocks between cream streets, green parks with round trees, one or two shops called out |
| Night | any zoom, when night mode is on | Dark purple land, darker water, cream lines at 75%, stars |

Between zoom 12 and 14 colours blend from regional to street. Night replaces both.

**When night switches on:** when the sun is down where the bird is (`!isDaylight(now, birdPosition)`),
which is what the tracker computes today. That is also exactly when a bird roosts. A bird flying
through the night on espresso or goggles still gets the night map. For a landed flight use the
destination; for a scheduled one, the loft. Cross-fade the two styles over one second.

## 2. Colours and lines

All hex values are in `tokens/map-colours.json`.

| Feature | Regional | Street | Night | Ink outline? |
|---|---|---|---|---|
| Land | `#D4EBB0` | `#D4EBB0` | `#4A4380` | no |
| Woods and green land | `#B9DE95` | same | `#525884` | no |
| Parks | `#86D9A0` | `#B9DE95` | `#566186` | street only: 2 pt |
| Built-up area / blocks | `#FFE9BF` | `#FFE2A8` | `#5B548D` (blocks `#605A91`) | no: the streets' casings outline the blocks |
| Lot lines (building edges) | hidden | ink at 30%, 1 pt | cream at 18% | n/a |
| Water | `#A9DDF7` | same | `#2C2752` | yes: 1.5 pt, growing to 2.5 pt by zoom 12 |
| Rivers | `#A9DDF7` on an ink casing | same | `#2C2752` on a cream casing at 75% | casing is the outline |
| Roads | `#FFFBF0` on an ink casing | same, wider | `#726B99` on a `#2C2752` casing | casing is the outline |
| State borders | ink at 40%, 1.4 pt, dashes 3 on 3 off | hidden above zoom 11 | cream at 50% | n/a |
| Your loft's block | n/a | `#FFC93C` | same | 2.5 pt |
| Recipient's block | n/a | `#F59C8E` | same | 2.5 pt |
| Highlighted shop | n/a | `#F4623F` marker with a cream pill | same | 2.5 pt |

Road widths stay as they are in the current style (casing 3 to 13 pt, fill 1.2 to 10 pt by zoom).
Blocks are not a map feature: they appear because cream streets with ink casings are drawn over
a butter-yellow built-up area. That is why the built-up fill changes colour by zoom.

The loft's and recipient's blocks are optional. If wanted, the app adds them the way it adds the
route: a GeoJSON source holding the building under each pin (`queryRenderedFeatures` at the pin,
`building` layer), drawn as a fill with a 2.5 pt ink line. If no building is found, skip it.

## 3. Decorations

Sizes are at 1x. Night versions are in `svg/night/` and in the sprite with `-night` on the name.

| Decoration | File | Size | Drawn by |
|---|---|---|---|
| Pine | `tree-pine` | 18 x 18 | style, from the sprite |
| Round tree | `tree-round` | 28 x 28 | style |
| Two pines | `tree-pair` | 34 x 22 | style (optional swap for big woods) |
| Soft green patch | `hill` | 60 x 28 | not needed if woods are filled; spare |
| Mountain | `mountain` | 36 x 26 | style |
| Squiggle | `wave` | 22 x 10 | spare single |
| Squiggle tile | `wave-pattern` | 128 x 128 | style, as a fill pattern on water |
| City dot, big city dot | `city-dot`, `city-dot-major` | 14 x 14, 18 x 18 | style, with the city's name |
| Label pill | `place-pill` | 36 x 24, stretches | style (shops) and HTML (pins) |
| Shop marker | `shop-highlight` | 34 x 34 | spare; the style uses the pill |
| Cloud | `cloud` | 74 x 36 | app, in screen space |
| Stars | `star`, `star-small` | 14 x 14, 6 x 6 | app, in screen space, night only |
| Your loft pin | `pin-loft` | 30 x 30 | app, HTML marker (exists today) |
| Recipient pin | `pin-recipient` | 32 x 32 | app, HTML marker (exists today) |
| Bird | the `Bird` component, `fly` pose | 82 wide | app, HTML marker (exists today) |
| Bird's shadow | `bird-shadow` | 34 x 12 | app, same marker, 26 pt below the bird |
| Speech bubble | HTML and CSS; `speech-bubble-sample` shows it | up to 190 wide | app |

## 4. Where each decoration may appear

| Decoration | Appears on | Zooms | How dense | Notes |
|---|---|---|---|---|
| Pines | `landcover` polygons with class `wood` | 6 to 13 | One per polygon, and no two closer than 26 pt (`icon-padding`) | 0.8x at zoom 6, 1.1x at zoom 12 |
| Round trees | `park` polygons | 14 and up | One per polygon, 18 pt apart | City parks may live in `landcover` (subclass `park`) on these tiles: check and add that filter |
| Mountains | `mountain_peak` points, rank 1 and 2 | 5 to 12 | 30 pt apart, most important first | No names |
| Squiggles | all `water` except rivers | 4 and up | The tile repeats every 128 pt: about three squiggles per tile | Fixed size on screen at every zoom |
| City dots | `place`, with the city's name to the right | as the current `place` layer | Collision as today | Class `city` gets the big dot |
| Shop pills | `poi` with subclass bakery, cafe, ice cream, pizza, deli, books or pet | 15.5 and up | 60 pt apart, so one to three on screen | The pill shows a generic word (BAGELS, COFFEE...), never the shop's name |
| Clouds | screen space | 11 and below | Two or three on screen, never over the bird, a pin or a pill | Drift left to right, 30 to 50 seconds across, wrap. Hidden at street zoom |
| Stars | screen space, night | all | 12 to 16, in the top two thirds, never over a label | `coo-twinkle`, 3 to 6 s, staggered |

Screen-space pieces do not move when the map pans. That is intended: they are weather, not places.
Everything animated is transform and opacity only and stops under reduced motion.

## 5. Labels

The map can only use fonts that exist as glyph files on the tile server. Today that is Noto Sans.
The mocks use Nunito. To match them, build glyph files for Nunito ExtraBold and Black (for
example with `font-maker` or `build_pbf_glyphs`) and serve them from `public/map/fonts/`; then
swap the font names below. Until then the styles use Noto Sans Bold, which is close enough.

| Label | Text | Font | Size | Letter spacing | Colour | Zooms | Max width |
|---|---|---|---|---|---|---|---|
| State | UPPERCASE | Bold (Nunito Black) | 10 at zoom 4, 12 at zoom 8 | 0.22 em | ink at 50%; night cream at 72% | up to 8 | 8 em, then wraps |
| Sea, lake | UPPERCASE italic | Italic | 10 to 12 | 0.3 em | ink at 50% | all | 6 em, then wraps |
| City | As written | Bold (Nunito ExtraBold) | 11 at zoom 5, 13 at zoom 12 | 0 | ink; night cream | by rank, as today | 9 em, then wraps |
| Street | UPPERCASE | Bold | 9.5 at zoom 15, 11 at zoom 17 | 0.08 em | ink | 15 and up | follows the street |
| Park | UPPERCASE | Bold | 10 | 0.14 em | ink at 70% | 15 and up | 7 em, then wraps |
| Shop pill | UPPERCASE word | Bold | 10 | 0.12 em | ink on cream | 15.5 and up | 9 em; the pill grows to fit |

All map labels keep a cream halo (1.2 to 2 pt; `#4A4380` at night) so they read over roads.
At zoom 4 and below, hide state names if they collide; do not abbreviate them.

## 6. The flight line

| Part | Day | Night |
|---|---|---|
| Flown | `#F4623F`, 5 pt, round ends, over an ink casing of 8 pt | same |
| Still to go | ink dots: 3.5 pt line, round caps, dash `[0.01, 2.2]`, so a dot about every 8 pt | cream dots at 85% |

The flown part ends under the bird. The dots start one dot-gap ahead of it.
(Today the app draws the remaining part as 2 pt dashes; this replaces that.)

## 7. Things drawn over the map

**Speech bubble.** HTML, anchored above the bird and a little behind it.
Cream fill, 2.5 pt ink outline, 14 pt corners, tilted −4°, tail 14 x 12 pointing at the bird.
Text is Caveat 700, 22 px, ink. Padding 6 by 12. Max width 190 pt: wraps to two lines, then
cuts with an ellipsis. Lines come from the flight log copy; keep them under 28 characters and
they never wrap. Shown for 4 seconds, about once every 20 to 40 seconds, never while the user is
dragging the map. Flips to the other side when within 100 pt of a screen edge.

**Pin pills** ("Your loft", "Priya, Philadelphia"). Cream pill, 2 pt ink outline, Nunito 900,
12 px, padding 4 by 10. Max width 160 pt for the loft and 180 pt for the recipient. One line.
Cuts with an ellipsis. Never covers its own pin: sits beside it, on the side with more room.

**Bird.** Faces the way it is flying (flipped when heading west). Shadow 26 pt below. Roosting:
the sleep pose on a barn, water tower or tree. Delayed: the surprised pose.

## 8. Text that must never overflow

| Text | Max width | Then |
|---|---|---|
| Speech bubble | 190 pt | wraps to 2 lines, then ellipsis |
| Loft pin pill | 160 pt | one line, ellipsis |
| Recipient pin pill | 180 pt | one line, ellipsis |
| Shop pill | 9 em of text (about 110 pt) | pill grows; words are fixed and all fit |
| Top bar "Gerald → Priya" | each name 9 characters | ellipsis on each name, the arrow always shows |
| Status chip (In the air, Roosting, Delayed) | fits its longest word | never wraps, never shrinks |
| Scale pill ("500 ft", "100 mi") | 64 pt | fixed words, always fit |
| Map labels | see section 5 | wrap at max width; MapLibre hides a label that collides |

For the loft: the LOFT 4B sign holds 7 characters at 9.5 px in a 58 pt plate; if the unit number
ever varies, cap it at 7 characters. TO LET is fixed. The greeting wraps, to three lines at most,
and stays in the left two thirds. Flock names and status lines are one line with an ellipsis.
