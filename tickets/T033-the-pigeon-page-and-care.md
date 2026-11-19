# T033. The pigeon page and care

Phase: 4 Flock and economy  
Depends on: T020

## Goal

Birds need feeding, bathing and rest, and show how they feel.

## Read first

- `docs/04-game-rules.md (9, 12)`
- `docs/06-api.md (Flock)`
- `docs/07-screens.md (Pigeon)`
- `docs/08-design-system.md (Which pose when)`

## Looks like

- `reference/screens/png/Pigeon.png` (and the `.html` beside it in `html/`)

## Build

- Feed, bath, nap and rename endpoints. Tick steps 8 and 9 (wake birds, hungry notices).
- The Pigeon screen: portrait with pose by state, level line, mood sentence (a small table of lines by state), meters, abilities, quirks, record.
- 'Feed me' on Main now works.

## Done when

- [ ] Feed costs 3 and adds 50 belly (capped at 100); with 2 seeds it is `insufficient_seeds`.
- [ ] Bath makes the bird busy 10 minutes, then feathers are 100. Nap: 30 minutes, then +50 energy. A busy bird cannot be sent.
- [ ] Scenario 10 of docs/13.
- [ ] One hungry notice when belly crosses under 30; none again until fed and hungry again.
- [ ] Care actions on a bird that is away, or not mine, are refused.
- [ ] The screen matches `reference/screens/png/Pigeon.png`.
- [ ] Type check, lint and the whole test suite pass.
