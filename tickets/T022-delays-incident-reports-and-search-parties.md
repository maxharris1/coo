# T022. Delays, incident reports and search parties

Phase: 1 The core loop  
Depends on: T021

## Goal

When a bird wanders off, it is funny, clear, and never a lost note.

## Read first

- `docs/04-game-rules.md (6)`
- `docs/05-flight-engine.md`
- `docs/06-api.md (search-party; tick steps 5 and 6)`
- `docs/07-screens.md (Lost)`

## Looks like

- `reference/screens/png/Lost.png` (and the `.html` beside it in `html/`)

## Build

- Tick steps 5 and 6: delay notices to both people once, roost notices to the owner once per night.
- `POST /api/flights/[id]/search-party`: owner, during a major delay, once; spend 20; `searchParty(flightId, now)`; on success recompute the plan with the override and store it; mark the outcome; search-and-rescue badge.
- The tracker's delayed state and banner. The incident report screen. 'Resend' opens Compose prefilled.

## Done when

- [ ] Scenario 4 of docs/13, using the `delay-major` flight id from `vectors.json`.
- [ ] A search party outside a major delay, by a non-owner, or a second time is refused; seeds are not spent on a refusal.
- [ ] A failed search still costs 20 and leaves the plan unchanged.
- [ ] After a successful search the stored plan equals the engine's output for the stored input plus the override, and `arrive_at` is earlier.
- [ ] Scenario 3: one roosting notice for the Chicago flight.
- [ ] The screen matches `reference/screens/png/Lost.png`.
- [ ] Type check, lint and the whole test suite pass.
