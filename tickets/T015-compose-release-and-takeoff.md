# T015. Compose, release and takeoff

Phase: 1 The core loop  
Depends on: T014

## Goal

Write a note, pick a bird, let it go.

## Read first

- `docs/04-game-rules.md (2, 5)`
- `docs/06-api.md (POST /api/flights)`
- `docs/07-screens.md (Compose, Takeoff)`

## Looks like

- `reference/screens/png/Compose.png` (and the `.html` beside it in `html/`)
- `reference/screens/png/Takeoff.png` (and the `.html` beside it in `html/`)

## Build

- `flights.send` service and `POST /api/flights` for immediate sends to friends: limits, validation, weather fetched before the transaction, then note + flight (`flying`, with input, plan, arrival) + bird status in one transaction, an `incoming` notification row for the recipient and `events` for both.
- The Compose screen: recipient card, note field with live counter against the chosen bird's limit, bird picker with reasons, stats and forecast line from the quote, Release button.
- The Takeoff screen with the `<Takeoff>` sequence, then on to the tracker route (a placeholder page until T016).

## Done when

- [ ] Sending creates one note and one flying flight whose stored plan equals `computeFlightPlan(stored input)`; the bird is `flying`.
- [ ] The recipient's sync shows the incoming flight with `hasNote: true` and no body anywhere in the response.
- [ ] A 141 character note with a plain bird is `invalid`; 280 is accepted with the tube.
- [ ] A bird that is flying, busy, too tired, or not mine cannot be sent. Nothing is created when any check fails.
- [ ] The 41st flight of the day is `rate_limited`.
- [ ] With the weather service down the send still works and the input holds the fallback.
- [ ] Compose matches `reference/screens/png/Compose.png`; Takeoff matches `Takeoff.png` and moves on by itself.
- [ ] Type check, lint and the whole test suite pass.
