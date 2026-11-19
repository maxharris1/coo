# T034. The closet

Phase: 4 Flock and economy  
Depends on: T033

## Goal

Dress birds for the weather from one shared closet.

## Read first

- `docs/04-game-rules.md (11)`
- `docs/06-api.md (gear, outfits)`
- `docs/07-screens.md (Wardrobe)`

## Looks like

- `reference/screens/png/Wardrobe.png` (and the `.html` beside it in `html/`)
- `reference/sheets/png/Gear.png` (and the `.html` beside it in `html/`)

## Build

- `PUT /api/birds/[id]/gear` and `PUT /api/outfits`.
- The Wardrobe screen: live preview on the bird, effects list, weather tip from tomorrow's forecast at the loft, outfits, the grid with 'On {name}' handling.

## Done when

- [ ] Putting on goggles then a beanie leaves only the beanie on the head slot.
- [ ] Taking an item from another home bird moves it; from a bird that is away is refused.
- [ ] Applying an outfit puts on the owned and free items in it and skips the rest.
- [ ] A flight released after dressing has the gear in its stored input, and the engine result reflects it (rain with goggles keeps full speed).
- [ ] The screen matches `reference/screens/png/Wardrobe.png`.
- [ ] Type check, lint and the whole test suite pass.
