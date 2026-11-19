# T032. Claiming a link and expiry

Phase: 3 Guest links  
Depends on: T031

## Goal

The stranger becomes a friend with a bird of their own, and replies.

## Read first

- `docs/11-guest-links.md (Claiming, Timing rules, Abuse controls)`
- `docs/06-api.md (tick step 10)`

## Looks like

- `reference/screens/png/GuestClaim.png` (and the `.html` beside it in `html/`)

## Build

- `POST /api/guest/[token]/claim` as specified.
- The short onboarding from a link: name and phone on the claim form → code → First bird → loft prefilled from the link's destination → Reply if the bird is still waiting, else the note in the shoebox and Main.
- 'Add to my sill' for an existing signed-in user.
- Tick step 10: expiry, `returned_at`, the sender's notification.
- The three-reports rule that stops a sender making links.

## Done when

- [ ] Scenario 6 of docs/13, the claim and expiry parts.
- [ ] Claiming twice by the same user succeeds once and changes nothing the second time; by a second user it is `gone`; by the sender it is `conflict`.
- [ ] After a claim inside the 30 minutes, the new user is the visit's host and can reply.
- [ ] A claim when the pair is blocked is `forbidden`.
- [ ] A sender with three reported links in 30 days gets `forbidden` on the next guest send.
- [ ] Type check, lint and the whole test suite pass.
