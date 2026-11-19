# T043. Limits, blocks and an authorisation audit

Phase: 5 Settings, safety and polish  
Depends on: T042, T032

## Goal

Prove that nobody can see or touch what is not theirs.

## Read first

- `docs/12-security-privacy.md`
- `docs/04-game-rules.md (16)`
- `docs/06-api.md (Friends: block)`

## Build

- Blocking in full: the pair cannot quote, send, join or claim; a visiting bird goes home; an in-flight bird lands silently and returns; nothing of either shows to the other.
- A table-driven test that calls every endpoint as a stranger and as a blocked user.
- Every limit in `config/game.json` → `limits` enforced with a test.
- The security headers in docs/12.

## Done when

- [ ] Scenario 12 of docs/13 covers every route file under `src/app/api` (the test fails if a route is missing from its table).
- [ ] Scenario 7 of docs/13.
- [ ] After a block, the blocked sender's in-flight note is marked returned at landing and the recipient gets no notification.
- [ ] Responses carry the headers in docs/12.
- [ ] Type check, lint and the whole test suite pass.
