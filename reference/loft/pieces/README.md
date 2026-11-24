# Loft rooftop scene

Every piece of the loft as its own SVG, where each one goes, the colours for each time of day
and the motion. This is the design Max approved: a yellow house on a rooftop with the city
behind it. Perches are rooms on the front of the house.

Start with `loft-pieces-sheet.png` (every piece) and `layout/loft-layout-sheet.png` (three lofts
with their anchor points).

## How to build the scene

The scene is 390 x 412 pt. The roof deck line is at y = 378. `layout/loft-layout.json` lists
every piece for three lofts with the top-left corner (x, y), size and layer, and the anchor
point for anything that stands on something. Each loft was rebuilt from the pieces and compared
with the full drawing, so the numbers are right.

Draw in this order, back to front:

1. Sky: colour bands, sun or moon, stars, clouds
2. Far city
3. Middle city
4. Near city
5. String lights
6. House: walls, cornice, doors, planks, roof, sign, chimney, smoke
7. Add-ons: weathervane, birdbath, espresso cart
8. Deck cap and brick wall, then the flower boxes on the wall
9. Birds. Always last. Nothing is ever drawn over a bird

Every city building runs down behind the deck. Nothing floats.

Width: at widths from 320 to 430 pt the whole scene scales as one picture, anchored to the
bottom. Use the `-390` layer files for the city and wall, or lay out the single buildings and
tiles yourself for a wider scene.

## The three lofts in the layout file

| Key | What | Rooms | Add-ons |
|---|---|---|---|
| `starter` | 1 bird, 3 perches | one floor of three | none |
| `max` | 3 birds, 5 perches | three below, two above (both free) | birdbath |
| `full` | 5 birds, 5 perches | three below, two above | birdbath, espresso cart, flower boxes, weathervane |

`birdSlots` gives each room's box, the box the bird is drawn in, and the point where its feet
meet the plank. Birds stand on the plank's top edge and face right.

Growth rules: three perches are one floor. The fourth perch adds an upper floor two rooms wide;
the fifth room shows TO LET until it is bought. The roof, sign, chimney and weathervane move up
with the house (`roofPeak` and `eaveY` in each loft).

## Fixed slots

| Slot | Anchor (x, y) | Size | Holds |
|---|---|---|---|
| Left deck | 38, 378 (bottom centre) | 60 x 70 | birdbath |
| Right deck | 353, 378 (bottom centre) | 60 x 72 | espresso cart |
| Wall under each deck slot | 38, 388 and 353, 388 (top centre) | 58 x 25 | flower boxes |
| Roof peak | 195, roof peak y | 44 x 34 | weathervane |
| Left and right shoulders | see `futureSlots` | 34 x 40 | free, for later items (two floors only) |
| Wall between the flower boxes | 70 to 320, y 388 to 412 | 250 x 24 | free, for a banner or sign |

## Where the brief's names are

| Brief asks for | File |
|---|---|
| Coop | `svg/house/wall-3-rooms`, `wall-2-rooms`, `cornice`, `roof-wide`, `roof-narrow`, `sign-loft-4b` |
| Rack, 3-perch | `svg/house/wall-3-rooms` with three `rooms/perch-plank` |
| Rack, 5-perch | add `svg/house/wall-2-rooms` and two more planks |
| Perch plank | `svg/rooms/perch-plank` |
| Chimney, smoke puff | `svg/house/chimney`, `svg/house/smoke-puff` |
| Parapet / brick tile, roof-deck cap | `svg/deck/brick-tile`, `svg/deck/deck-cap-tile`, or `svg/deck/wall-390` for both at full width |
| Skyline buildings | `svg/skyline/far-1..5`, `mid-1..5`, `near-*` (four), or the three `*-layer-390` files |
| Water tower, antenna, AC unit | `svg/skyline/water-tower`, `mast`, `ac-unit` |
| Clouds | `svg/sky/cloud-large`, `cloud-small` |
| Light-string post | `svg/lights/post` (spare, see below) |
| Bulb, on and off | `svg/lights/bulb-<colour>-on` and `-off`, five colours |
| Add-ons | `svg/addons/birdbath`, `espresso-cart`, `planter`, `weathervane` |

Also here though not asked for: room states (`rooms/door-lit`, `egg`, `egg-ready`, `suitcase`,
`feather`, `room-to-let`), neighbours' window types, sun, moon and star.

## Where the approved design differs from the brief

Four things. Each is a choice Max made when he approved the mocks; say so if you want any changed.

1. **No separate perch rack.** Perches are rooms on the house, three below and two above. That is
   what keeps five birds tidy.
2. **String lights hang behind the house, not in front of it,** on one line from edge to edge with
   its ends off screen. They are still above and behind every bird's head. Bulbs the roof would
   cut in half are left out. If visible anchors are wanted, `svg/lights/post.svg` is a spare:
   place its top-left corner at (-2, 146) and at (378, 146), drawn with the lights
   layer. `optional-light-posts.png` shows it. Not part of the approved scene.
3. **The planter hangs on the wall** as a flower box under each deck slot, instead of standing on
   the deck, so it can never crowd a bird or another add-on.
4. **Five looks, not four.** Sunrise, day, sunset, dusk and night, picked from the sun's height at
   the loft. The brief's names map on: morning = sunrise then day, afternoon = day, evening =
   sunset then dusk, night = night. `tokens/loft-colours.json` has both.

Brief rules that are met as written: every building runs behind the deck; three city depths with
ink outlines and lit windows only on the near one; no crosses anywhere (masts and flat or stepped
tops only); no wooden strip under the brick; birds on top; scales from one bird to five.

## Colours

`tokens/loft-colours.json` has, for each look: the sky bands, the far and middle city colours,
the tint and how strongly it applies to the near city, the house and add-ons, and the deck, the
cloud colour, the colour for text over the sky, whether lights are on, and the filter for birds.
Tinting means mixing each fill toward the tint by the given amount. Ink outlines and light
sources (lit windows, lit bulbs, the moon) are never tinted.

The SVGs carry plain hex so they work anywhere. Each shape also has a class such as `fill-sun`
or `stroke-ink`. Inline the SVG and load `tokens/loft-tokens.css` and the classes take over, so
colours come from tokens. `rooms/feather.svg` uses `currentColor`: set it to the wing colour of
the bird that is out.

Lights are on from sunset to sunrise. Birds are asleep at dusk and night.

## Motion

`motion.json` has the keyframes, duration, easing, loop and stagger for each.

| What | Duration | Easing | Loop |
|---|---|---|---|
| Chimney smoke | 5 s per puff | ease-out | forever, three puffs 1.6 s apart |
| Bulb twinkle (halo only, lit only) | 3, 4 or 5 s by bulb | ease-in-out | forever, 0.37 s apart |
| Clouds | 30 s large, 24 s small | ease-in-out | back and forth, 18 pt |
| Weathervane | 7 s | ease-in-out | back and forth, 6° each way |
| Change of look | 2 s | linear | once, cross-fade |

Transform and opacity only. All of it stops under reduced motion and pauses while the tab is hidden.

## Text in the scene

| Text | Max width | Then |
|---|---|---|
| LOFT 4B sign | 7 characters in a 58 pt plate | cap the unit number at 7 characters |
| TO LET | fixed | n/a |
| Greeting over the sky | left two thirds of the screen | wraps, three lines at most |
| Flock row name and status line | the row, less the avatar and chip | one line each, ellipsis |
| Status chip | fits its longest word | never wraps |
