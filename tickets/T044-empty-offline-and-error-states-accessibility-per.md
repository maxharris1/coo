# T044. Empty, offline and error states; accessibility; performance

Phase: 5 Settings, safety and polish  
Depends on: T043

## Goal

The app is kind when there is nothing to show, when things fail, and to everyone using it.

## Read first

- `docs/07-screens.md (Empty, loading and error states)`
- `docs/08-design-system.md (Accessibility)`
- `docs/14-content-voice.md`

## Looks like

- `reference/sheets/png/Illustrations.png` (and the `.html` beside it in `html/`)
- `reference/sheets/png/Voice.png` (and the `.html` beside it in `html/`)

## Build

- Every list screen's empty state with the copy and an illustration. The loader. Error toasts with the lines in docs/14.
- Keyboard and screen-reader pass on every screen. The tracker card as a polite live region.
- Check 360 px and 430 px widths on every screen.
- Measure the Main and Flights screens with five animated birds on a mid-range phone profile; if frames drop, use static poses in lists.

## Done when

- [ ] An automated accessibility check (axe) finds no serious issues on every route.
- [ ] Each empty state renders with zero rows.
- [ ] No text is clipped or overlapping at 360 px on any screen (screenshots attached to the summary).
- [ ] With reduced motion on, nothing moves except fades.
- [ ] Type check, lint and the whole test suite pass.
