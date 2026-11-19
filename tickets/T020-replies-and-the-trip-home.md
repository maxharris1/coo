# T020. Replies and the trip home

Phase: 1 The core loop  
Depends on: T019

## Goal

A reply rides home free, and every bird gets home.

## Read first

- `docs/04-game-rules.md (8)`
- `docs/06-api.md (The tick, steps 3 and 4)`
- `docs/07-screens.md (Reply, TakeoffHome)`

## Looks like

- `reference/screens/png/Reply.png` (and the `.html` beside it in `html/`)
- `reference/screens/png/TakeoffHome.png` (and the `.html` beside it in `html/`)

## Build

- `POST /api/visits/[id]/reply`: the reply note and the return flight, in one transaction, weather fetched first.
- Tick step 3 (end visits → empty return flights) and step 4 (land returns: bird home, care settled, reply delivered, 5 seeds, RFC 1149 progress, found-object roll, notifications).
- The Reply and TakeoffHome screens. The Recipients screen's 'free ride' row leads to Reply.

## Done when

- [ ] Scenario 1 of docs/13 in full, and scenario 2.
- [ ] A reply after `leaves_at`, or to a visit that is not mine, is refused and nothing is created.
- [ ] The reply's limit is the visiting bird's limit.
- [ ] A return flight's destination is the owner's active loft at the moment it starts (turn on travel before the visit ends and check).
- [ ] The found object appears for flight ids whose hash says so, and never twice for one flight.
- [ ] Screens match `Reply.png` and `TakeoffHome.png`.
- [ ] Type check, lint and the whole test suite pass.
