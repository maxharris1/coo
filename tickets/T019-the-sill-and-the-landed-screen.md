# T019. The sill and the Landed screen

Phase: 1 The core loop  
Depends on: T018

## Goal

A bird arrives on your sill with a note you can finally read.

## Read first

- `docs/04-game-rules.md (8)`
- `docs/06-api.md (Receiving)`
- `docs/07-screens.md (Landed and the Sill tab)`

## Looks like

- `reference/screens/png/Landed.png` (and the `.html` beside it in `html/`)

## Build

- Visits in sync. The `/sill` tab and the Landed screen with the landing animation on first view, the postmarked note card, the trip summary, the countdown.
- `POST /api/visits/[id]/snack` and `/release`.
- The dot on the Sill tab.

## Done when

- [ ] The host can read the note; anyone else gets `not_found` for the visit.
- [ ] A snack costs the host 5, raises the bird's belly by 40, pays the owner 5 (6 with the bow tie, 10 for a Fantail), works once.
- [ ] A snack with 4 seeds is `insufficient_seeds` and changes nothing.
- [ ] After `leaves_at` the screen shows the 'has gone home' state.
- [ ] The screen matches `reference/screens/png/Landed.png`.
- [ ] Type check, lint and the whole test suite pass.
