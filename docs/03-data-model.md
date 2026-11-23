# 03. Data model

The schema is `supabase/migrations/0001_init.sql`. It has been applied and tested. This document
explains it. If the two disagree, the SQL wins; fix this document.

## Conventions

- Ids are UUIDs, except the two append-only logs (`seed_ledger`, `events`).
- All times are `timestamptz`, UTC.
- Status columns are text with a check constraint.
- Deleting an `auth.users` row removes the profile and, by cascade, everything the person owns,
  including notes they sent. Notes they received stay with their senders. See "Deleting an account".
- Row level security is on for every table with no policies, except read-your-own on `events` and
  the server role `coo_app` on `tick_health`.
- `coo_app` has no access to schema `auth`. Its only paths to `auth.users` are security definer
  functions only `coo_app` may execute: `sync_phone_last4(p_user)` copies the last four digits of
  the Auth phone to `profiles.phone_last4`, `guest_links_for_phone(p_user)` lists the active guest
  links sent to that phone, and `lock_auth_user(p_user)` takes a key-share lock on the user row
  for the rest of the transaction and returns whether the user still exists, so a place search
  can never write a held place for a deleted account.

## Tables

### profiles
One per user. `id` equals the Supabase Auth user id.

- `handle`: lower-case, unique, shown in friend lists. `invite_code`: `handle` plus a random
  suffix, the secret in the invite link.
- `seeds`: the balance. Changed only by `apply_seeds`.
- `perches` (3 to 5), `has_birdbath`.
- `deliveries_count`: lifetime deliveries landed. Drives eggs.
- `home_*`: the loft. `home_lat`/`home_lon` are already snapped to the roost grid; the exact
  position is never stored. `home_label` is a neighbourhood ("Williamsburg"). `home_city` and
  `home_city_lat`/`lon` are the city and its centre, used for friends set to city level.
- `travel_*`: same fields for the travel switch. When `travel_on`, they replace the home loft
  for new flights. "Active loft" in this packet means travel when on, home otherwise.
- Notification switches, quiet hours, `sms_fallback`, `installed` (opened from the home screen at least once).
- `onboarded_at`: null until onboarding is finished.

### friendships
One row per pair, with `a_id < b_id`. `a_shows` is the detail a lets b see (`block` or `city`),
`b_shows` the reverse. `status` is `accepted` or `blocked`; `blocked_by` says who blocked.
There is no pending state: opening an invite link or claiming a guest link makes the row.
Write a helper `pair(x, y)` that orders the ids, and use it everywhere.

### birds
- Identity: `name`, `breed`, `look` (palette key from `assets/data/birds.json`), `pronoun`, `quirks`.
- Abilities: `speed_mph`, `focus` 1 to 5, `navigation` 1 to 5. Fixed at hatching.
- Record: `miles`, `deliveries`, `detours`. Level is derived from `miles`.
- Care: `belly`, `feathers`, `energy` as of `care_at`, plus `last_fed_at` and `hungry_notified`.
  Current values are computed on read (`docs/04-game-rules.md`). Write them back only when
  something changes them.
- `status`: `home`, `scheduled` (reserved for a timed send), `flying`, `visiting` (on a sill),
  `busy` (nap, bath or odd job; `busy_kind` and `busy_until` say which and until when).
  A busy bird whose `busy_until` has passed is treated as home and fixed up lazily.
- `gear`: the item ids the bird is wearing. At most one per slot. An item id appears on at most
  one of an owner's birds. Both rules are enforced in code (`lib/game/gear.ts`), not SQL.

### gear_owned, outfits
`gear_owned`: which items a user's closet holds. `outfits`: named sets of item ids
("Everyday", "Cold snap", "Fancy") that can be put on a bird in one tap.

### guest_links
A private link for a recipient without an account. `token_hash` is the SHA-256 of pepper plus
token; the token itself is never stored. `dest_*` is the snapped destination the sender picked.
`notify_phone` holds a phone number only if the guest asked for a landing text, and is cleared
when that text is sent. `expires_at` is set at landing. Details in `docs/11-guest-links.md`.

### notes
The message. `recipient_id` is null while the recipient is a guest and is filled on claim.
`reply_to` links a reply to the note it answers. `delivered_at` is set at landing; before that
neither the body nor the doodle may be sent to the recipient. `returned_at` marks a guest note
whose link expired. The 560 limit in SQL is the largest any bird can carry; the real limit is
checked in code.

A note is text, a doodle, or both. `body` is the trimmed text and may be empty only when `doodle`
is set. `doodle` is `jsonb`, null for a text-only note, in this shape:

```json
{ "v": 1, "w": 300, "h": 200, "strokes": [{ "color": "ink", "width": "marker", "points": [[12, 40], [14, 41]] }] }
```

`validateDoodle` in `src/lib/game/notes.ts` is the one place a doodle is checked, against the
limits in `config/game.json` under `notes.doodle`. SQL keeps two backstops:
`notes_body_check` (body 0 to 560 characters, and at least 1 unless there is a doodle) and
`notes_doodle_check` (a JSON object of at most 65,536 bytes as text).

### flights
One trip by one bird.

- `kind`: `delivery` (carries a note out) or `return` (flies home, with or without a reply).
- `owner_id` is always the bird's owner. `counterpart_id` is the other person: the recipient of
  a delivery, the host a return leaves from. Null for guests.
- `from_*`, `to_*`: the endpoints used, already adjusted for privacy, with display labels.
- `status`: `scheduled` → `flying` → `landed`, or `scheduled` → `cancelled`.
- `release_at`: when the bird leaves. `arrive_at`: from the plan.
- `input`, `plan`: exactly what went into and came out of the engine. Enough to recompute.
- `place_names`: names for points along the route, for the flight log and the headline.
  Shape: `{ "deciles": ["Brooklyn", "Staten Island", ...11 entries], "events": { "3": "Edison, NJ" },
  "dest": { "city": "Philadelphia", "region": "PA", "country": "US" } }`.
- `search_party`, `delay_notified`, `roosts_notified`: bookkeeping so each thing happens once.
- A partial unique index allows one `scheduled` or `flying` flight per bird.

### visits
A bird on a sill after a delivery. `leaves_at` is arrival plus 30 minutes. `status`:
`waiting` → `replied` (host sent it home with a note) or `left` (time ran out).
`host_id` is null for a guest until they claim. `return_flight_id` points at the flight home.

### seed_ledger, apply_seeds, punch_cards
Every change to a balance is a ledger row. The unique index on `(user_id, reason, ref_id)` makes
awards safe to repeat. Reasons in use: `welcome`, `delivery`, `reply_home`, `new_city`,
`punch_card`, `job`, `found_trade`, `tip`, `snack`, `feed`, `search_party`, `shop`, `dev_grant`.
Always pass a `ref_id` when there is a natural one (the flight, the visit, the job).
`punch_cards` counts deliveries per user per week.

### jobs, found_objects
An odd job in progress or done, and things birds brought home. `found_objects.source_id` is the
job or flight that produced it and is unique, so a retry cannot find a second object.

`jobs.dest_lat`, `dest_lon` and `dest_label` (0007) are where the bird goes on the job. They are
set once, in the transaction that starts the job. The point is snapped, and it lies the bird's
calm-air one-way distance in miles (`speedMph × (1 + levelSpeedBonus × (level − 1)) × (minutes / 2) / 60`)
from the active loft roost, on a bearing hashed from `jobs.id`. The label is the job's `short` text
from `config/jobs.json`, never an address. `jobs_dest_check` keeps the three all set or all null.
They are null for jobs started before 0007 and for users with no loft.

### postmarks, badges, bird_meetings, eggs
Collections. `badges` rows hold progress and, once earned, a date. `eggs` has at most one row
per user that is not `hatched`.

### push_subscriptions, notifications, events
`notifications` is the in-app list and the record of what was pushed or texted.
Its unique index on `(user_id, kind, ref_id)` stops repeats. `events` is the Realtime nudge.

### reports, rate_limits, geo_cache, weather_cache, dev_clock
Safety and plumbing. `rate_limits` is a fixed-window counter keyed by a string such as
`flights:{userId}`.

## Relationships at a glance

```
auth.users 1-1 profiles 1-n birds 1-n flights n-1 notes
profiles n-n profiles          (friendships)
flights 1-0..1 visits 0..1-1 flights (the return)
guest_links 1-1 notes, 1-1 flights
profiles 1-n seed_ledger, jobs, found_objects, postmarks, badges, eggs, notifications, events
```

## Deleting an account

`DELETE /api/account` deletes the `auth.users` row using the Supabase admin API, after:
any bird of theirs that is away is simply removed with them; any bird of someone else's on
their sill is sent home at once with an empty return flight; notes they received from others
stay in the senders' shoeboxes with the recipient shown as "a former friend".
The schema test covers the cascade.
