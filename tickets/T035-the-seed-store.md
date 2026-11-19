# T035. The seed store

Phase: 4 Flock and economy  
Depends on: T034

## Goal

Spend seeds on gear, a birdbath and perches.

## Read first

- `docs/04-game-rules.md (10, 14)`
- `docs/06-api.md (shop)`
- `docs/07-screens.md (Shop)`

## Looks like

- `reference/screens/png/Shop.png` (and the `.html` beside it in `html/`)

## Build

- `GET /api/shop`, `POST /api/shop/buy` for gear, `birdbath` and `perch`, each one transaction with `apply_seeds`.
- The Shop screen with the confirm step and the seed burst animation on success.

## Done when

- [ ] Scenario 9 of docs/13.
- [ ] Buying an owned item, the backpack, or a sixth perch is `conflict`.
- [ ] Perch 4 costs 250 and perch 5 costs 400. The birdbath halves feather drain from then on.
- [ ] Two buy requests at once for the same item charge once.
- [ ] The screen matches `reference/screens/png/Shop.png`.
- [ ] Type check, lint and the whole test suite pass.
