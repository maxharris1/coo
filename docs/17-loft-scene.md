# 17. The loft scene

The picture at the top of the home screen (`/`). One yellow house on a New York rooftop. Every
perch is a room on the front of the house, every add-on has one fixed place, and the whole scene
changes colour with the real sun.

Numbers and colours are in `config/loft.json`. The drawing code this was designed with is
`reference/generator/loft.py`; port it the way `Bird.tsx` was ported from `rig.py`. Expected
markup for 20 combinations is in `public/assets/loft-reference/` (`index.json` maps files to
props). Pictures: `reference/loft/png/`, and clickable copies in `reference/loft/html/`.

## 1. The stage

Scene units are points at a 390 pt wide screen. The scene is 390 × 412.

| Thing | Where |
|---|---|
| Deck line (everything stands on it) | y = 378 |
| Deck edge (cream strip) | y 378 to 388 |
| Brick wall | y 388 to 412 |
| Sky band for the top bar and greeting | y 0 to 128. Sky, clouds, moon and stars only |
| String lights | One curve from (−6, 150) through a low point of y = 200 at x = 195 to (396, 150). 13 bulbs |
| House | Centred on x = 195 |
| Left deck slot | Centred on x = 38, 60 wide |
| Right deck slot | Centred on x = 353, 60 wide |

Rules that keep it tidy:

1. One ground line. Everything stands on the deck or on a perch.
2. Nothing overlaps anything it is not standing on.
3. Each add-on has exactly one place. Buying one never moves another.
4. The birds sit against the flat yellow of the house, never against windows.
5. Nothing moves between times of day. Only colour changes.

## 2. Rooms

One room per perch, 74 wide and 80 tall, three to a floor, filled bottom-left first.

| Perches | Rooms (x, y of top-left) | Roof peak |
|---|---|---|
| 3 | (84, 298) (158, 298) (232, 298) | y = 254 |
| 4 | the three above, then (121, 218), and (195, 218) drawn as "to let" | y = 178 |
| 5 | the three above, then (121, 218) (195, 218) | y = 178 |

A floor is always built two rooms wide, so with 4 perches the fifth room exists and hangs a
"TO LET" sign. A cream cornice caps the ground floor when there is a second floor. The roof always
sits on the top floor: 10 pt overhang each side, 44 pt rise over three rooms, 40 pt over two.
On the roof: the "LOFT 4B" sign, a stovepipe on the right slope with three smoke puffs, and the
weathervane slot on the peak.

Inside each room: a round doorway (centre 17, 19 from the room's corner, radius 10) and a wooden
perch plank whose top is 68 pt below the room's top. A bird is drawn 65 pt wide with its feet on
the plank, 5 pt in from the room's left edge.

### What a room shows

Rooms are in flock order, the same order as the list under the scene. Bird `i` owns room `i`.

| Situation | Room shows | Tap goes to |
|---|---|---|
| Bird is home and awake | The bird, `perched` pose, with the existing idle gestures | `/birds/{id}` |
| Bird is home and tired, napping, or the sun is down | The bird, `sleep` pose. No idle gestures | `/birds/{id}` |
| Bird is away (flying, on a sill, on a job, scheduled) | No bird. One feather on the perch in that bird's wing colour | `/birds/{id}` |
| No bird, a roommate is owed | A suitcase on the perch | `/aviary/roommate` |
| No bird, the egg is ready | An egg in a nest, cracked and wobbling | `/aviary` |
| No bird, the egg is not ready | An egg in a nest, still | `/aviary` |
| No bird, nothing waiting | Doorway and bare perch | nothing |
| Built but not bought (room 5 with 4 perches) | Sand-coloured panel, dashed outline, "TO LET" sign | `/shop` |

Free rooms are filled in this order: roommate, egg, then empty. This is the existing
`perchSlots` order with the unhatched egg added.

## 3. Add-ons

| Add-on | Place | Owned when |
|---|---|---|
| Rooftop birdbath | Left deck slot | `me.hasBirdbath` |
| Espresso cart | Right deck slot | not sold yet |
| Flower boxes | Hung on the wall under each deck slot. Nothing rises above the deck line | not sold yet |
| Weathervane | Roof peak. Moves up with the roof | not sold yet |
| String lights, stovepipe, sign | Always there | free |

The drawing code takes a list of add-ons so the three unsold ones are ready when the store sells them.

## 4. The city behind

Three depths, drawn back to front:

1. **Far.** Tall pale shapes in one flat colour, one spire. No outlines, no windows.
2. **Middle.** Towers in a darker tint with small window grids. Some windows are lit.
3. **Near.** The neighbours across the street: flat colour, 2 pt ink outlines, real windows with
   sills, a cornice. Left: a tall brick walk-up and a low slate roof with a stair hut. Right: a
   slate building with a roof garden and a brick one carrying a wooden water tower.

Rules: no neighbour rises above the string lights. Lit windows stop 70 pt above the deck. No
window is cut by the house wall. No crosses anywhere: aerials are plain masts.

## 5. Times of day

The look is picked from how high the sun is at the user's active loft, using `sunAltitudeDeg`
from the flight engine with server-corrected time. Birds at home sleep exactly when a bird in the
air would have to roost.

| Sun altitude | Look | Lights | Birds | Sky |
|---|---|---|---|---|
| above 6° | `day` | unlit | awake | blue |
| −0.833° to 6°, rising | `sunrise` | unlit | awake | pale blue over peach, sun low on the right |
| −0.833° to 6°, falling | `sunset` | glowing | awake | pink over orange, sun low on the left |
| −6° to −0.833° | `dusk` (also used before sunrise) | glowing | asleep | violet, five stars |
| below −6° | `night` | glowing | asleep | indigo, moon, twelve stars |

"Rising" means the altitude ten minutes from now is higher than now. With no loft set, fall back
to the clock in the user's time zone: 22:00 to 04:59 is `night`, otherwise `day`.

What changes, and nothing else:

- **Sky**: flat bands from `times.<look>.sky`. The first band is also the colour behind the top
  bar and greeting.
- **Far and middle city**: the two colours in `far` and `mid`. Window colour is the middle colour
  mixed halfway to the lowest sky band.
- **Near city, house, add-ons, deck**: the day drawing with every flat colour mixed toward `tint`
  by the amount given for that layer. Ink outlines are never tinted.
- **Light sources are never tinted**: lit windows, bulbs and their halos, glowing doorways, the
  sun, the moon and stars.
- **Lights**: off means each bulb is its colour mixed 38% toward cream, with no halo. On means
  full colour with a twinkling halo.
- **Doorways**: dark by day. At dusk and night they are warm yellow with a soft halo.
- **Birds**: asleep at dusk and night. Dimmed with the CSS filter in `birdFilter`.
- **Words on the sky** use `textColor`: ink, or cream at dusk and night.
- **Clouds** use `cloud`. At night the large cloud gives way to the moon and the small one is hidden.

When the look changes while the screen is open, cross-fade over two seconds. With reduced motion,
swap at once. Check once a minute while the tab is visible.

## 6. Colour

Every colour is a design token or a mix of tokens. `mix(a, b, t)` is a plain per-channel blend in
RGB, rounded, as in `loft.py`. The scene's own colours (sky tints, wood shade, roof shade, the
neighbours' walls) are mixes written in the drawing code, and each time of day's colours are in
`config/loft.json`. The reference files are the check: if the markup matches, the colours are right.

## 7. Motion

All transform and opacity only, all off with reduced motion, all paused while the tab is hidden.

| What | Keyframes |
|---|---|
| Smoke puffs | `loft-smoke`, 5 s, three puffs 1.6 s apart |
| Bulb halos, stars, birdbath sparkle | `coo-twinkle` |
| Weathervane | `coo-sway`, 7 s |
| Ready egg | `coo-wobble`, 0.9 s |
| Clouds | `coo-drift`, 24 to 30 s, back and forth |
| Birds | the existing loft idle gestures; asleep birds use the `sleep` pose's own motion |

`loft-smoke`: from `translate(0, 10px) scale(.4)`, opacity 0; opacity 1 at 25%; to
`translate(9px, -12px) scale(1.25)`, opacity 0.

## 8. The screen around it

- The art (everything below y = 128) is anchored to the bottom of the hero and scales with the
  screen width from 320 to 430 pt as one picture.
- The top bar and greeting sit on the sky band in normal flow. The band is as tall as they need;
  for a two-line greeting at 390 pt that is 128 pt, which makes the hero 412 pt tall.
- Keep the greeting to the left two thirds so the cloud or moon on the right stays clear.
- The scene has one text alternative that says who is home, asleep and out, and what is free.

## 9. If there are ever more than five perches

A third floor fits the same way: three rooms to a floor, newest floor on top, top floor centred.
Add 80 pt of sky for it. Nothing else in this document changes.

## 10. The pieces, cut apart

Fable's second pack (2026-11-23) cuts the approved art into one SVG per piece. The app still draws
the scene from code (`src/app/(app)/loftArt.ts`, ported from `reference/generator/loft.py`); the
pieces are for anyone who needs a single item on its own (the store, a sheet, a later scene).

| What | Where |
|---|---|
| One SVG per piece: house, rooms, deck, add-ons, lights, sky, skyline | `assets/svg/loft/<group>/`, served from `public/assets/svg/loft/` |
| The `fill-*` / `stroke-*` classes the pieces carry | `assets/svg/loft/loft-tokens.css` (not loaded by the app) |
| How to build the scene from the pieces, sizes, slots, text limits | `reference/loft/pieces/README.md` |
| x, y, size and layer of every piece for three lofts | `reference/loft/pieces/layout/loft-layout.json` and `loft-layout-sheet.png` |
| Colours per look, with the brief's four names mapped to the five looks | `reference/loft/pieces/tokens/loft-colours.json` |
| Smoke, twinkle, clouds, weathervane keyframes | `reference/loft/pieces/motion.json` (all already in `public/assets/motion.css`) |
| Every piece on one sheet, and the spare light posts in place | `reference/loft/pieces/loft-pieces-sheet.png`, `optional-light-posts.png` |

Where the pieces and this document disagree, this document and `config/loft.json` win. In
particular the layout file's `birdBox` is 70 pt wide (Fable's drawing); the app draws birds
65 pt wide (`config.loft.rooms.bird.width`, decided on #943) so a party hat never crosses the
room top while a bird hops.

The right deck item is an espresso cart, drawn by `cart()` in `loftArt.ts` and matched by the
fixtures in `public/assets/loft-reference/`. Its two steam wisps twinkle and stop under reduced
motion. The cart is decoration only: espresso shots are still bought in the store.

The spare light posts (`assets/svg/loft/lights/post.svg`) are not part of the approved scene.
