# T009. Onboarding: profile and first birds

Phase: 0 Foundation  
Depends on: T008, T005, T003

## Goal

A new person names a pigeon and gets a working account.

## Read first

- `docs/04-game-rules.md (1)`
- `docs/06-api.md (Onboarding)`
- `docs/07-screens.md (First bird)`

## Looks like

- `reference/screens/png/Welcome.png` (and the `.html` beside it in `html/`)

## Build

- `POST /api/onboarding` as specified: profile, unique handle, invite code, two birds with the starter abilities and random quirks, starter gear, three default outfits (Everyday, Cold snap, Fancy; empty where items are not owned), the first egg, 60 seeds via `apply_seeds(user, 60, 'welcome', userId)`. One transaction. Safe to repeat.
- The First bird screen: three looks to swipe, name field with shuffle, pronoun chips, then the roommate panel. Match the Welcome mock.
- A blocklist check on names (a short list in `src/lib/blocklist.ts`).

## Done when

- [ ] After onboarding the database has one profile, two birds (45/2/4 and 54/1/3), bell and bow in the closet, one incubating egg at 5 deliveries, 60 seeds and one ledger row.
- [ ] Calling it twice creates nothing new and pays nothing more.
- [ ] Two people named Max get different handles.
- [ ] A name over 30 characters or on the blocklist is `invalid`.
- [ ] The screen matches `reference/screens/png/Welcome.png`.
- [ ] Type check, lint and the whole test suite pass.
