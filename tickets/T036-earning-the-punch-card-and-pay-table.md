# T036. Earning: the punch card and pay table

Phase: 4 Flock and economy  
Depends on: T035

## Goal

People can see how seeds are earned and how close the weekly card is.

## Read first

- `docs/04-game-rules.md (10)`
- `docs/07-screens.md (Earn)`

## Looks like

- `reference/screens/png/Earn.png` (and the `.html` beside it in `html/`)

## Build

- `GET /api/earn` (jobs and found objects may be empty until T037).
- The Earn screen: the punch card with stamps, the pay table from config, the party hat bonus when owned.
- A 'You earned' card on the tracker when my delivery lands, with the breakdown from the ledger rows for that flight.

## Done when

- [ ] The card shows the right count for the user's local week across a Sunday-to-Monday boundary in their time zone.
- [ ] The breakdown for a first delivery to a new city that also fills the card lists delivery, new city and punch card amounts that sum to the balance change.
- [ ] The screen matches `reference/screens/png/Earn.png`.
- [ ] Type check, lint and the whole test suite pass.
