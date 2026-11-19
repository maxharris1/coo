# T012. Friends

Phase: 1 The core loop  
Depends on: T011

## Goal

People become friends by link and control what each friend can see.

## Read first

- `docs/06-api.md (Friends)`
- `docs/03-data-model.md (friendships)`
- `docs/07-screens.md (Friends, Join)`
- `docs/12-security-privacy.md`

## Looks like

- `reference/screens/png/Friends.png` (and the `.html` beside it in `html/`)

## Build

- The friends service and endpoints in docs/06: list, invite lookup, join, set visibility, unfriend, block, reset invite, report.
- `pair(x, y)` helper; all reads go through one `friendshipBetween` function.
- The Friends screen and the public `/join/[code]` page (signed out → sign-in → back).
- Friend rows show where they are via `endpointFor`, and the distance from my active loft.

## Done when

- [ ] Joining by code makes one accepted row with both sides `block`, notifies the inviter once, and is safe to repeat.
- [ ] After Priya sets Max to `city`, Max's friends list shows her city name and the distance to the city centre, not her roost.
- [ ] A blocked pair cannot join again. Unfriending removes the row.
- [ ] Resetting the invite makes the old code `not_found`.
- [ ] The 151st friend is refused.
- [ ] The screen matches `reference/screens/png/Friends.png`.
- [ ] Type check, lint and the whole test suite pass.
