# T031. The guest page

Phase: 3 Guest links  
Depends on: T030

## Goal

A stranger taps a link and watches a pigeon fly to them.

## Read first

- `docs/11-guest-links.md`
- `docs/06-api.md (Guest links)`
- `docs/12-security-privacy.md`

## Looks like

- `reference/screens/png/Guest.png` (and the `.html` beside it in `html/`)
- `reference/screens/png/GuestClaim.png` (and the `.html` beside it in `html/`)

## Build

- `GET /api/guest/[token]`, `/notify`, `/report`, with per-IP limits.
- The public page `/b/[slug]`: the Guest state (live map, sealed note, 'Text me when he lands' with the consent box, 'What is this?', Report) and, after landing, the note with the claim form. The expired state.
- Landing for guest flights in the tick: `expires_at`, the landing text if a number was left, then clear it.
- The headers for `/b/` pages in docs/11.

## Done when

- [ ] Scenario 6 of docs/13, the public parts.
- [ ] Before landing the response has no note; after, it does. A wrong token and a missing one give the same `not_found`.
- [ ] A reported link returns `not_found` afterwards.
- [ ] A number left with the box unticked is refused. After the landing text the stored number is null.
- [ ] The page sends `Referrer-Policy: no-referrer` and `X-Robots-Tag: noindex`.
- [ ] Screens match `Guest.png` and `GuestClaim.png`.
- [ ] Type check, lint and the whole test suite pass.
