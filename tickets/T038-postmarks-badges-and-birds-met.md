# T038. Postmarks, badges and birds met

Phase: 4 Flock and economy  
Depends on: T022, T037

## Goal

A sticker album of where your birds have been.

## Read first

- `docs/04-game-rules.md (15)`
- `config/badges.json`
- `docs/07-screens.md (Collections)`

## Looks like

- `reference/screens/png/Collections.png` (and the `.html` beside it in `html/`)

## Build

- `GET /api/collection`.
- The remaining badge rules: rfc-1149, early-bird, search-and-rescue, full-house, and a check that every rule in `config/badges.json` is implemented.
- The Collection screen with the stamp animation on a newly earned postmark.

## Done when

- [ ] Each of the twelve badges has a test that earns it and a test that does not.
- [ ] Progress badges show 'n of goal' and earn at the goal, once.
- [ ] Birds met counts distinct birds that landed on my sill.
- [ ] The screen matches `reference/screens/png/Collections.png`.
- [ ] Type check, lint and the whole test suite pass.
