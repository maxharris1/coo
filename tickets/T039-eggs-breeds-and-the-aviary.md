# T039. Eggs, breeds and the aviary

Phase: 4 Flock and economy  
Depends on: T038

## Goal

New birds hatch, and fancy breeds fly differently.

## Read first

- `docs/04-game-rules.md (14)`
- `config/breeds.json`
- `docs/05-flight-engine.md`
- `docs/07-screens.md (Aviary, Hatch moment)`

## Looks like

- `reference/screens/png/Aviary.png` (and the `.html` beside it in `html/`)
- `reference/sheets/png/Pigeons.png` (and the `.html` beside it in `html/`)

## Build

- `GET /api/aviary`, `POST /api/eggs/hatch` with `rollHatchling`, then the next egg 25 deliveries on.
- The Aviary screen and the hatch moment.
- Breed traits end to end: fantail tips, pouter limit and second card, frillback and jacobin and king through the engine input, king energy, tumbler landing animation.

## Done when

- [ ] Scenario 11 of docs/13.
- [ ] A hatchling's breed is one the user does not own while any remain; its abilities are inside the breed's ranges; the same egg id always gives the same bird.
- [ ] A Jacobin's stored focus is 5. A King's flight input carries `breed: 'king'` and its plan matches the `king-twilight` behaviour (later dusk than a city pigeon on the same route).
- [ ] A Pouter accepts a 280 character note and the Landed screen shows two cards.
- [ ] The screen matches `reference/screens/png/Aviary.png`.
- [ ] Type check, lint and the whole test suite pass.
