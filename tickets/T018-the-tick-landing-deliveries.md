# T018. The tick: landing deliveries

Phase: 1 The core loop  
Depends on: T015, T005

## Goal

When a bird's arrival time passes, everything that should happen happens, exactly once.

## Read first

- `docs/06-api.md (The claim pattern, The tick)`
- `docs/04-game-rules.md (7, 10, 14, 15)`
- `docs/10-notifications.md (The notification pipeline, steps 1 to 3)`

## Build

- `tick(deps, { userId? })` with step 2 of docs/06 in full: note delivered, bird updated, visit created, pay, delivery count, punch card, postmark, egg readiness, badges (first-flight, night-owl, cher-ami, around-the-block, century, long-haul, full-card, postmaster progress), birds met, notification rows, events.
- `notify()` as far as inserting the row and the event (delivery to devices comes in T027 and T028).
- `POST /api/cron/tick` with the secret, compared in constant time.
- `/api/sync` runs the tick for the caller before answering.

## Done when

- [ ] Scenario 1 of docs/13 up to the landing: note delivered, visit waiting with `leaves_at` 30 minutes on, Max is paid 13 for the delivery and 25 for the new city, one `landed-in` and one `landed-out` notification, bird `visiting`, miles and deliveries updated.
- [ ] Scenario 8: two ticks at once for the same flight produce one of everything.
- [ ] A second tick changes nothing.
- [ ] The fifth delivery sets the egg `ready`. The tenth in a week pays 50 once. A first delivery to a city pays 25 and adds a postmark; a second to the same city does not.
- [ ] The 11th delivery of the local day pays 2.
- [ ] Without the secret the tick endpoint is `unauthenticated`.
- [ ] Before the arrival time the recipient cannot read the note by any endpoint.
- [ ] Type check, lint and the whole test suite pass.
