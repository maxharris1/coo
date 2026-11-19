# T040. The shoebox

Phase: 4 Flock and economy  
Depends on: T020

## Goal

Every note, kept.

## Read first

- `docs/06-api.md (GET /api/notes)`
- `docs/07-screens.md (Shoebox)`

## Looks like

- `reference/screens/png/Shoebox.png` (and the `.html` beside it in `html/`)

## Build

- `GET /api/notes` with friend filter and paging: delivered notes I sent or received, and my guest notes.
- The Shoebox screen.

## Done when

- [ ] An undelivered note sent to me is absent; one I sent that has not landed is present and marked 'In the air'.
- [ ] The friend filter shows only that friend's notes, both directions.
- [ ] A note from a deleted account shows 'a former friend'.
- [ ] The screen matches `reference/screens/png/Shoebox.png`.
- [ ] Type check, lint and the whole test suite pass.
