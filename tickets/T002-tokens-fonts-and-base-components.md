# T002. Tokens, fonts and base components

Phase: 0 Foundation  
Depends on: T001

## Goal

The design system in code, so every later screen is assembled from the same parts.

## Read first

- `docs/08-design-system.md`
- `docs/07-screens.md (Shell)`

## Looks like

- `reference/sheets/png/Tokens.png` (and the `.html` beside it in `html/`)
- `reference/sheets/png/Components.png` (and the `.html` beside it in `html/`)
- `reference/screens/png/Main.png` (and the `.html` beside it in `html/`)

## Build

- Import `tokens.css` and `motion.css` globally. Declare the seven font files with `@font-face` and `font-display: swap`.
- Global styles: paper background, ink text, Nunito body, the 430 px centred column on wide screens, safe-area padding, the reduced-motion rule, the focus ring.
- Build the components listed in docs/08 'Components' with CSS Modules: Button, Card, Row, Chip, Pill, Header, TabBar, Field, TextArea with counter, Toggle, Segmented, Meter, Stat, Sheet, Toast, Avatar, NoteCard, Postmark, PunchCard, ProgressBar, EmptyState, Icon (inlines an SVG from `public/assets/svg/icons` by name).
- A page at `/dev/components` (not in production) that shows every component in every state, laid out like the Components sheet.

## Done when

- [ ] `/dev/components` matches `reference/sheets/png/Components.png` and `Tokens.png` by eye: colours, outlines, shadows, radii, type.
- [ ] A test renders each component and checks it has no hard-coded hex colour (all colour values are `var(--coo-*)`).
- [ ] Button: pressed state moves down and drops its shadow; disabled uses sand; text on tomato and sun is ink.
- [ ] Every interactive component is reachable by keyboard and has an accessible name. TextArea announces characters left.
- [ ] Type check, lint and the whole test suite pass.
