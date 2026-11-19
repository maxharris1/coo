# T024. Several recipients at once

Phase: 1 The core loop  
Depends on: T023

## Goal

One note, several friends, one bird each.

## Read first

- `docs/04-game-rules.md (3)`
- `docs/07-screens.md (Recipients, Compose)`

## Looks like

- `reference/screens/png/Recipients.png` (and the `.html` beside it in `html/`)
- `reference/screens/png/Compose.png` (and the `.html` beside it in `html/`)

## Build

- Compose with several recipients: default assignment (fastest ready bird to the farthest friend), swapping, a limit check per bird, a per-recipient stats row.
- `POST /api/flights` with several sends in one transaction: all or nothing.

## Done when

- [ ] Three recipients and three ready birds create three notes and three flights.
- [ ] If one bird cannot fly, nothing is created and the error names the bird.
- [ ] Six recipients is `invalid`. The same bird twice is `invalid`.
- [ ] A note that fits one bird's tube but not another's is refused with the bird's name.
- [ ] Type check, lint and the whole test suite pass.
