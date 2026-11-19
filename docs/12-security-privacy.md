# 12. Security and privacy

Coo holds three sensitive things: where people live, their phone numbers and their private
notes. The rules below are requirements, each with a test in some ticket.

## Location

1. **Exact positions are never stored.** A position from the browser or the geocoder is snapped
   to the roost grid (round latitude to 0.002°, longitude to 0.0025°) in the request handler,
   before any database write and before any log line. Only snapped values go further.
2. **Addresses are never stored.** If someone searches an address, we keep the snapped point
   and a neighbourhood label. The search text is not saved against the user.
3. **Friends see a roost or a city.** Per friend, `block` (the roost and its neighbourhood
   label) or `city` (the city centre and city name). Default `block`. The API applies this in
   one function, `endpointFor(viewer, subject)` in `lib/game/privacy.ts`; no other code reads
   another person's coordinates.
4. **Non-friends see nothing.** Not a city, not a distance.
5. **Flights reveal their endpoints** to the two people involved, and to a guest for a guest
   link. That is inherent: a bird drawn landing on a block shows the block.
6. The roost grid is coarse on purpose. In a dense city one cell holds hundreds of homes; in
   the countryside it may hold one. The Loft step offers "Use my town centre instead" for
   anyone who prefers it, which stores the city centre as their roost.

## Notes

1. A note's body is returned only to its sender, and to its recipient after `delivered_at` is
   set. Before landing the recipient's API responses carry `hasNote: true` and nothing more.
2. Note bodies are never written to logs, analytics, push payloads or text messages.
   Notifications say that a note arrived, not what it says.
3. Notes are stored as plain text in Postgres. They are not end-to-end encrypted. Say so in the
   privacy page. (Supabase encrypts disks at rest.)
4. Render note text as text. Never as HTML.

## Phone numbers

1. Live in Supabase Auth. `profiles` keeps the last four digits only.
2. Never shown to other users. Friends are made by links, not by phone lookup.
3. There is no "find friends from contacts" upload. The Android contact picker returns a name
   to the page for prefill and nothing is sent to the server but the name the sender confirms.
4. A guest's number for a landing text is stored until that one text is sent, then cleared.

## Accounts and sessions

- Sign-in is by text code only. Sessions are Supabase's cookies: HttpOnly, Secure, SameSite=Lax.
- State-changing endpoints accept only `POST`, `PUT`, `PATCH`, `DELETE` with a JSON content type
  and check the `Origin` header against the app's domain.
- Supabase Auth's own limits on code requests apply; set them to 5 an hour per number in the dashboard.

## Authorisation

The server connects as the database owner, so row level security does not protect us from our
own bugs. Therefore:

- Every service function takes the acting user's id and every query filters by it.
- "Not yours" and "does not exist" both return `not_found`.
- Each endpoint has a test that calls it as a different user and expects `not_found` or `forbidden`.
- Row level security is still enabled on every table with no policy, so the public key in the
  browser can read nothing except the user's own `events` rows. The schema test checks this.

## Secrets and tokens

- Guest link tokens and invite codes are generated with `crypto.randomBytes`.
- Guest link tokens are stored hashed with a pepper. They are never logged; log the link's id.
- `CRON_SECRET` is compared in constant time.
- No secret has a `NEXT_PUBLIC_` name.

## Limits and abuse

- Fixed-window limits in `rate_limits` (`config/game.json` → `limits`).
- Blocking removes the friendship, sends their bird home, hides future contact both ways and
  prevents new friendships between the pair.
- Reports are stored for a person to read.
- All text people type (names, bird names, notes) is length limited and trimmed. Names and bird
  names are checked against a short blocklist of slurs; notes between friends are not filtered.

## Headers

`Content-Security-Policy` allowing self, the Supabase project, the tile host and `blob:` workers
for MapLibre; `X-Content-Type-Options: nosniff`; `Referrer-Policy: strict-origin-when-cross-origin`
(and `no-referrer` under `/b/`); `Permissions-Policy` allowing geolocation for self only.

## Data people can ask for

- Delete account: in Settings. Removes everything described in `docs/03-data-model.md`.
- There is no export in the first build. The shoebox shows every note.

## Pages to write

A plain-language privacy page (`/privacy`) and terms page (`/terms`), linked from the Hello
screen, Settings and the Guest page. The privacy page states: what is kept (phone number, roost,
notes, push subscription), what is not (exact location, address, contacts), who processes it
(Supabase, Vercel, Twilio, OpenFreeMap, Photon, Open-Meteo), and how to delete. A person, not
an agent, must approve the final text.

## Children

Coo is not for children under 13. The Hello screen says so in small print. Nothing else is done
about age in the first build.
