# T037. Odd jobs and found objects

Phase: 4 Flock and economy  
Depends on: T036

## Goal

Idle birds can earn a little and bring home odd things.

## Read first

- `docs/04-game-rules.md (13)`
- `docs/06-api.md (jobs, found; tick step 7)`

## Looks like

- `reference/screens/png/Earn.png` (and the `.html` beside it in `html/`)
- `reference/screens/png/Flights.png` (and the `.html` beside it in `html/`)

## Build

- Offers by hash of user and local date. `POST /api/jobs`. Tick step 7. `POST /api/found/trade`.
- Jobs on the Earn screen and, while running, on Flights and in the bird's status.

## Done when

- [ ] The same user sees the same two offers all day and different ones the next day.
- [ ] A job makes the bird busy for its minutes; afterwards the owner is paid once and the bird is home.
- [ ] The fourth job of the day pays half, rounded down; the seventh is refused.
- [ ] A found object appears for job ids whose hash says so; trading pays the sum of values once and empties the list.
- [ ] A job with a bird that is not home, or a job that is not on offer, is refused.
- [ ] Type check, lint and the whole test suite pass.
