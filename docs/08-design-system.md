# 08. Design system

The look is a sticker book: thick ink outlines, flat colour, hard offset shadows, a chunky
display face and a friendly body face. The reference sheets in `reference/sheets/png/` are the
authority: Tokens, Components, Icons, Pigeons, Gear, Illustrations, MapStyle, Motion, AppIcon, Voice.
Open the HTML versions in `reference/sheets/html/` to inspect exact CSS.

## Tokens

`assets/tokens.css` defines every colour, font, radius, outline and shadow as a CSS variable
(`--coo-*`). `assets/tokens.json` has the same values. Import the CSS once, globally. Use only
these variables. Do not type hex colours into components.

| Role | Variable | Value |
|---|---|---|
| Text, outlines, shadows | `--coo-ink` | `#2A2140` |
| App background | `--coo-paper` | `#FFF4DC` |
| Cards, inputs, note paper | `--coo-card` | `#FFFBF0` |
| Hero areas, water, info | `--coo-sky` | `#A9DDF7` |
| Primary action, alerts | `--coo-tomato` | `#F4623F` |
| Selected, secondary action, seeds | `--coo-sun` | `#FFC93C` |
| Ready, good odds | `--coo-mint` | `#86D9A0` |
| Resting, roosting | `--coo-lilac` | `#D5D1EA` |
| Soft warning | `--coo-peach` | `#F9C5B4` |
| Locked, unavailable | `--coo-sand` | `#E9E3D0` |
| Secondary text | `--coo-muted` | `#5E5675` |
| Postmark ink | `--coo-stamp` | `#C23A1C` |

Rules that keep it looking right:

- Outlines are 2.5 px ink. Shadows are solid ink, straight down, 3, 4 or 5 px, never blurred.
- Text on tomato and on sun is ink, never white. Body text is never lighter than `--coo-muted`.
- A pressed button moves down by its shadow height and loses the shadow (`coo-press`).
- Corners: 20 px buttons, 18 px cards, 16 px rows, 14 px tiles, 6 px for paper notes, full pills for chips.
- Page gutter 16 px. Minimum touch target 44 px.

## Type

Self-hosted from `assets/fonts/` (woff2, Latin). Declare with `font-display: swap`.

| Use | Font | Weights |
|---|---|---|
| Titles, big numbers, the logo | Bagel Fat One | 400 |
| Everything else | Nunito | 600, 700, 800, 900 |
| Handwritten notes | Caveat | 600, 700 |

Sizes are on the Tokens sheet. Note bodies are always Caveat on card colour with a 6 px radius,
slightly rotated (about −1°).

## Components

The Components sheet draws the main ones with their states; the screen mocks show the rest in
use. Build these first (ticket T002), in the same style, and build screens only from them:

Button (primary tomato, secondary sun, quiet card, disabled sand; full width by default),
Card, Row, Chip (status colours as on the sheet), Pill (seed balance), Header, TabBar with the
raised Send button, Field and TextArea with counter, Toggle, Segmented control (City / Block),
Meter (care bars), Stat (number over label), Sheet (bottom sheet), Toast, Avatar (bird in a
circle, person initial in a circle), NoteCard, Postmark, PunchCard, ProgressBar, EmptyState.

## Birds

There are two kinds of bird art in the packet.

1. **Static poses**: `assets/svg/birds/<look>/<pose>.svg` and `assets/svg/birds/breeds/<breed>.svg`.
   Good for places with no motion (push icon, share image, lists if performance demands it).
2. **The rig**: a jointed bird (tail, legs, torso and wing, neck, head) whose parts are animated
   by the keyframes in `assets/motion.css`, and which can wear gear that moves with the head and
   neck. This is what the app shows almost everywhere.

The rig's source is `reference/generator/rig.py` (`bird`, `fly`, `pose`, `ON`, `ON_PRE`).
Ticket T003 ports it to a React component:

```tsx
<Bird look="gerald" breed="city" pose="perched" gear={['goggles','band']} animated size={140} />
<Bird look="gerald" pose="fly" gear={['scarf']} animated />
```

`assets/rig-reference/` holds the expected output for every look and pose
(`<look>--<pose>.svg`, animated, open one in a browser) plus dressed examples and
`takeoff.html`. Use them as snapshot fixtures: the component's markup for the same props must
match, apart from attribute order and whitespace.

Colours for each look and breed are in `assets/data/birds.json`. All birds face right; flip with
`transform: scaleX(-1)` when flying west or when the layout needs it.

### Which pose when

| Situation | Pose | Motion preset |
|---|---|---|
| Home and fine | `perched` | idle (head bob, blink, breathe, tail flick, wing shrug) |
| Napping, roosting on a trip | `sleep` | sleeping, with the drifting z |
| Being fed, getting a snack | `eat` | pecking, for 3 seconds, then back |
| Sulking | `sulk` | sulking |
| Hungry, hawk advisory, incident report | `surprise` | tail flick |
| On a sill with a note | `landed` | hopping |
| Just delivered, just hatched | `proud` | calm |
| In the air | `fly` | flying |
| Start of takeoff | `crouch` | (part of the takeoff sequence) |

### Gear on birds

Overlays are in `assets/svg/gear/overlays/` in the bird's own coordinates, and as parts in
`rig.py`. Layer order: bird, neck item, head item, leg item. Goggles replace the eye highlight.
Closet and store icons are in `assets/svg/gear/icons/`.
Night-vision goggles are an olive helmet with one monocular tube, not a lens tint on the aviators;
the tube flips up off the eye on the sleep pose.

## Motion

`assets/motion.css` has 38 keyframes, all prefixed `coo-`. `assets/motion.json` lists each with
its duration, easing and use. `assets/preview/motion.html` and the Motion sheet show them running.

- **Takeoff**: two stacked sprites, as in `assets/rig-reference/takeoff.html`. Run
  `coo-takeoff-crouch` and `coo-takeoff-fly` once each with `animation-duration: 2.5s` and
  `animation-fill-mode: forwards`. The bird has left the frame at 61%, about 1.5 seconds.
  Add `coo-puff` and `coo-feather` as on the Takeoff mock.
- **Landing**: `coo-land-fly` then `coo-land-perch`, once, with `coo-spin` on the sunburst and
  `coo-stamp` on the postmark.
- **Seeds paid**: `coo-burst`, `coo-burst-l`, `coo-burst-u` on three seed icons.
- **Route still to fly**: `coo-march` on the dashed line.
- With `prefers-reduced-motion: reduce`, turn off everything except opacity changes and show
  final frames. One global rule does this.
- Only animate `transform` and `opacity`.

## Icons and illustrations

- 49 interface icons in `assets/svg/icons/`, 24 px grid, 2 px stroke, `currentColor`. Inline
  them so they take the text colour. Do not add an icon set.
- 24 illustrations in `assets/svg/illustrations/` for empty states, the flight log, found
  objects and scenes. If a screen needs art that is not here, compose it from these pieces.

## App icon and install

`assets/app-icon/` has SVG masters and PNG exports. `assets/manifest.webmanifest` is ready;
replace its name fields from `config/app.json` at build time. See `docs/10-notifications.md`.

## Accessibility

- Contrast: ink on every token background passes. Muted text is only used on paper and card.
- Every icon-only button has an `aria-label`. Every bird image has alt text: "{name}, {state}".
- The map is decorative for screen readers; the card under it carries the same information as text
  and updates politely (`aria-live="polite"`, at most once a minute).
- Focus rings: 3 px tomato outline, 2 px offset.
