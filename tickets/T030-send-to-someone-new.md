# T030. Send to someone new

Phase: 3 Guest links  
Depends on: T024, T017

## Goal

Send a real pigeon to a friend who has never heard of Coo.

## Read first

- `docs/11-guest-links.md`
- `docs/06-api.md (POST /api/flights)`
- `docs/07-screens.md (NewRecipient, ShareLink)`

## Looks like

- `reference/screens/png/NewRecipient.png` (and the `.html` beside it in `html/`)
- `reference/screens/png/ShareLink.png` (and the `.html` beside it in `html/`)

## Build

- The NewRecipient screen with place search. On Android with the Contact Picker, a contact's name prefills the name field.
- Guest sends in `POST /api/flights`: the link row with the hashed token, the note with `guest_link_id`, the flight with `guest_link_id` and no counterpart. The address is returned once.
- The ShareLink screen: `sms:` link with the share template, Copy, Web Share, the shown-once state.
- Guest links waiting on the Friends screen.

## Done when

- [ ] A guest send stores `sha256(pepper + token)` and never the token; the token appears only in the response (search the database and the captured logs for it).
- [ ] The 6th guest link in a day is `rate_limited`.
- [ ] The destination stored is snapped.
- [ ] The `sms:` link's body is the template with the bird's pronoun and the address.
- [ ] Screens match `NewRecipient.png` and `ShareLink.png`.
- [ ] Type check, lint and the whole test suite pass.
