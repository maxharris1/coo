# 06. API, tick and realtime

All endpoints are Next.js route handlers under `/api`. JSON in, JSON out. Unless marked public,
they need a signed-in user with a finished profile; otherwise `401 unauthenticated` or
`409 not_onboarded`. Every body is validated with zod. Every response includes `serverNow`
(epoch ms). Ids are UUID strings. Times are epoch ms.

## Errors

`{ "error": { "code", "message" } }` with these codes:

| Code | Status | When |
|---|---|---|
| `unauthenticated` | 401 | No session |
| `not_onboarded` | 409 | Session but no finished profile |
| `invalid` | 400 | Body failed validation. `message` names the field |
| `not_found` | 404 | No such thing, or it is not yours. Never reveal which |
| `forbidden` | 403 | Blocked, or not a friend |
| `conflict` | 409 | State does not allow it: bird not home, visit over, already claimed, perch full |
| `insufficient_seeds` | 402 | Cannot afford it |
| `rate_limited` | 429 | Over a limit |
| `gone` | 410 | Guest link expired |
| `internal` | 500 | Anything unexpected |

## Shared shapes

```ts
type Place = { lat: number; lon: number; label: string };          // always snapped or a city centre
type Bird = { id, name, breed, look, pronoun, speedMph, focus, navigation, quirks: string[],
  level, miles, deliveries, detours,
  belly, feathers, energy, hungry, scruffy, tired, sulking,          // computed now
  status: 'home'|'scheduled'|'flying'|'visiting'|'busy', busyKind?, busyUntil?,
  gear: string[], noteLimit: number, canFly: boolean, cannotFlyReason?: string };
type Flight = { id, kind: 'delivery'|'return', status, bird: BirdLite, owner: PersonLite,
  counterpart?: PersonLite, guestName?: string, from: Place, to: Place,
  releaseAt, arriveAt?, distanceMi?, odds?, plan?: FlightPlan, input?: FlightInputPublic,
  placeNames, searchParty?: 'found'|'not_found', role: 'mine'|'incoming', hasNote: boolean };
type Visit = { id, bird: BirdLite, owner: PersonLite, note: { id, body, createdAt }, arrivedAt,
  leavesAt, status, snackGiven, flight: { distanceMi, durationMs, delayKind } };
type PersonLite = { id, name, handle };
```

`FlightInputPublic` is the stored input without the bird's care numbers. A recipient gets the
plan and input of an incoming flight (they need them to animate it) but **never the note** until
it has landed.

## Sync

### GET /api/sync
First runs the tick steps for rows that belong to or are aimed at this user. Then returns:

```ts
{ serverNow, me: { id, name, handle, inviteCode, seeds, perches, hasBirdbath, units, timezone,
    loft: Place & { city: string, travelling: boolean }, installed, settings: {...} },
  birds: Bird[], closet: string[], outfits: Outfit[],
  flights: Flight[],            // scheduled or flying, mine and incoming; plus landed in the last 24 h
  visits: Visit[],              // waiting on my sill
  myVisiting: { birdId, hostName, leavesAt }[],
  egg: { status, deliveriesToGo }, punchCard: { weekStart, deliveries, size, paid },
  unread: number, friendsCount: number }
```

Also updates `profiles.timezone` if the request header `X-Timezone` differs.

## Onboarding and profile

| Endpoint | Body | Does |
|---|---|---|
| `POST /api/onboarding` | `{ name, handle?, timezone, bird: { name, look, pronoun }, secondBird?: { name, pronoun } }` | Creates the profile (handle generated from the name if missing, made unique), the two birds, starter gear, three default outfits, the first egg, and pays the welcome seeds. Safe to repeat |
| `POST /api/loft` | `{ lat, lon }` or `{ placeId }`, optional `centre: true` | Snaps, looks up the neighbourhood and city, saves the home loft, sets `onboarded_at`. With `centre: true` it saves that place's city centre as the roost ("Use my town centre instead") |
| `POST /api/loft/travel` | `{ on: true, lat, lon }` or `{ on: false }` | Travel switch. `conflict` if changed in the last 12 hours |
| `PATCH /api/settings` | Any of: `name`, `units`, notification switches, quiet hours, `smsFallback`, `installed`. Optional `account`: the user id the client checked | Updates the profile. `conflict` with no write if `account` is not the signed-in user |
| `DELETE /api/account` | `{ confirm: handle }` | See `docs/03-data-model.md` |

## Places

| Endpoint | Does |
|---|---|
| `GET /api/geo/search?q=` | Up to 6 results `{ placeId, label, sublabel, kind: 'neighbourhood'|'city'|'address' }`. Results are held server-side under `placeId` for 10 minutes, and a place saved with `POST /api/loft` stays held for its owner so its town centre can still be chosen; coordinates are not returned |
| `GET /api/geo/here?lat=&lon=` | For "use my location": returns the snapped roost label and city. The exact position is used once and dropped |

## Friends

| Endpoint | Body | Does |
|---|---|---|
| `GET /api/friends` | | `[{ id, name, handle, shows, theyShow, where: string, distanceMi, pendingGuest?: ... }]` plus my guest links still waiting |
| `GET /api/invite/[code]` (public) | | `{ name }` of the inviter, for the join page |
| `POST /api/friends/join` | `{ code }` | Creates the friendship, both sides `block`. Notifies the inviter. `conflict` if blocked. Fine to repeat |
| `PATCH /api/friends/[id]` | `{ shows: 'block'|'city' }` | What I let them see |
| `DELETE /api/friends/[id]` | | Unfriend. Flights in the air finish normally |
| `POST /api/friends/[id]/block` | | Blocks and unfriends. A bird of theirs on my sill goes home now. A bird of theirs already in the air to me finishes its flight, but at landing the note is marked returned instead of delivered, I am told nothing, and the bird starts home at once |
| `POST /api/invite/reset` | | New invite code |
| `POST /api/reports` | `{ userId?, guestLinkToken?, reason }` | Files a report |

## Sending

### POST /api/flights/quote
Body: `{ recipients: [{ friendId } | { place: { placeId } }], birdIds?: string[], at?: number[] }`.

For each recipient returns distance, the endpoints' labels, and for each requested time
(default: now) a quote for the given bird, or for each ready bird if none is given:
`{ birdId, releaseAt, durationMs, arriveAt, odds, roostsOvernight, factors: [{ kind: 'headwind'|
'tailwind'|'rain'|'downpour'|'cold'|'snow'|'hawk'|'fair'|'hungry'|'scruffy'|'tired'|'distance',
text, effect }] , sunsetAt }`.

`effect` is found by running the engine with and without that one factor: a time difference
("+18 min") for speed factors, an odds difference ("6% off") for odds factors. Weather for
future hours comes from the hourly forecast. Quotes never touch the database except caches.

### POST /api/flights
Body: `{ body, sends: [{ friendId | guest: { name, placeId }, birdId }], releaseAt? }`.

In one transaction: checks limits, checks each bird is home, owned, able to fly and that the body
fits each bird's limit; creates one note per send; then for each send either releases now
(section 5 of `docs/04-game-rules.md`) or stores a `scheduled` flight. For a guest it creates the
guest link and returns the token **once**. Returns `{ flights: Flight[], guestLinks?: [{ flightId, url }] }`.

Weather and place names are fetched before the transaction opens, never inside it.

### Others

| Endpoint | Does |
|---|---|
| `GET /api/flights?cursor=` | History, newest first, 30 a page |
| `GET /api/flights/[id]` | One flight if I am the owner or the counterpart |
| `POST /api/flights/[id]/cancel` | Scheduled only. Frees the bird, deletes the note |
| `POST /api/flights/[id]/search-party` | Owner only, during a major delay, once. Spends 20 seeds, stores the outcome, recomputes the plan if found. Returns the flight |

## Receiving

| Endpoint | Body | Does |
|---|---|---|
| `POST /api/visits/[id]/reply` | `{ body }` | Host only, while `waiting` and before `leavesAt`. Creates the reply note and the return flight, sets `replied` |
| `POST /api/visits/[id]/snack` | | Host only, once. Spends 5, feeds the bird, tips the owner |
| `POST /api/visits/[id]/release` | | Host only. Sends the bird home now, without a note |

## Flock

| Endpoint | Body | Does |
|---|---|---|
| `PATCH /api/birds/[id]` | `{ name?, pronoun? }` | Rename |
| `POST /api/birds/[id]/feed` | `{ actionId }` | Home birds only. 3 seeds, belly +50. `actionId` is a uuid made once per tap. A repeat with the same id changes nothing and returns the current bird and seeds |
| `POST /api/birds/[id]/bath` | | Home only. Busy 10 minutes, feathers 100 |
| `POST /api/birds/[id]/nap` | | Home only. Busy 30 minutes, energy +50 at the end |
| `PUT /api/birds/[id]/gear` | `{ items: string[] }` | Home only. Validates ownership, one per slot, not worn by another bird (taking an item from another home bird is allowed and removes it there) |
| `PUT /api/outfits` | `{ outfits: [{ id?, name, items }] }` | Replaces the saved outfits (at most 6) |
| `GET /api/shop` | | Items with `owned`, `affordable`, plus loft items and the next perch |
| `POST /api/shop/buy` | `{ itemId }` | Gear id, `birdbath` or `perch`. One transaction |
| `GET /api/earn` | | Punch card, pay table, two job offers with jobs left today and current pay, found objects |
| `POST /api/jobs` | `{ jobId, birdId }` | Starts an offered job |
| `POST /api/found/trade` | | Trades all found objects |
| `GET /api/aviary` | | Perches, egg, breeds with `owned` |
| `POST /api/eggs/hatch` | `{ name, pronoun }` | Needs a ready egg and a free perch. Returns the new bird |
| `GET /api/collection` | | Postmarks, badges with progress, birds met |
| `GET /api/notes?friendId=&cursor=` | | Shoebox: delivered notes sent and received, newest first, with the bird and trip summary |

## Notifications

| Endpoint | Does |
|---|---|
| `GET /api/notifications` | Latest 50 |
| `POST /api/notifications/read` | Marks all read |
| `POST /api/push/subscribe` | Body: the browser's `PushSubscription` JSON. Upsert by endpoint |
| `POST /api/push/unsubscribe` | `{ endpoint }` |

## Guest links (public, rate limited by IP)

| Endpoint | Does |
|---|---|
| `GET /api/guest/[token]` | `{ senderName, recipientName, bird, flight (plan, endpoints, place names), note? }`. The note is present only after landing. Marks `opened_at`. `gone` after expiry |
| `POST /api/guest/[token]/notify` | `{ phone }` Stores the number for one landing text. Requires the consent checkbox value `true` |
| `POST /api/guest/[token]/report` | `{ reason }` Marks the link `reported`, hides the note, tells nobody but the log |
| `POST /api/guest/[token]/claim` | Signed-in. Links the note, the friendship and any waiting visit to this user. See `docs/11-guest-links.md` |

## Internal

| Endpoint | Does |
|---|---|
| `POST /api/cron/tick` | Needs `Authorization: Bearer CRON_SECRET`. Runs the tick. Returns counts |
| `POST /api/dev/clock` | Not in production. `{ addMs }` or `{ toFlight: id }` (jump to one second after that flight's next segment ends) or `{ reset: true }` |
| `POST /api/dev/grant` | Not in production. `{ seeds }` |

## The claim pattern

Every time-driven step uses the same shape, so that two runs at once, or a retry after a crash,
do the work exactly once:

```sql
-- inside one transaction per row
update flights set status = 'landed', landed_at = arrive_at
 where id = $1 and status = 'flying' and arrive_at <= $2      -- $2 is clock.now()
 returning *;
-- no row back: someone else did it. Stop.
-- row back: do the rest of the work in this same transaction.
```

To find work: `select id from flights where status = 'flying' and arrive_at <= $1 order by
arrive_at limit 50`, then one transaction per id. Seeds and notifications inside those
transactions are themselves protected by their unique indexes.

## The tick

`tick(deps, { userId? })` runs these steps in order. With `userId` it limits each query to rows
owned by or aimed at that user (that is what `/api/sync` calls). Process at most 50 rows per step
per run and stop after 20 seconds.

1. **Release scheduled flights** whose `release_at` has passed: sample weather, compute the plan
   with `departAtMs = release_at`, set `flying`. If the bird can no longer fly (energy under 15),
   release anyway; a promise is a promise.
2. **Land deliveries.** For each claimed flight:
   1. Set `notes.delivered_at`.
   2. Update the bird: miles, deliveries, detours, care, `status = 'visiting'`.
   3. Insert the visit (`leaves_at = arrive_at + 30 min`).
   4. Pay the owner: `apply_seeds(owner, pay, 'delivery', flight.id)`. "Deliveries paid today" is
      the count of the owner's `delivery` ledger rows since the start of their local day.
   5. Raise `profiles.deliveries_count`. Upsert the punch card; on reaching 10 unpaid,
      `apply_seeds(owner, 50, 'punch_card', flight.id)` and mark paid.
   6. Postmark: insert if new; if inserted, `apply_seeds(owner, 25, 'new_city', flight.id)`.
   7. Egg: if incubating and the count has reached its number, set `ready` and notify.
   8. Badges: update progress, mark earned.
   9. Insert `bird_meetings` for the recipient.
   10. Notifications: `landed-in` to the recipient (reference the visit), `landed-out` to the owner
       (reference the flight). For a guest: set `expires_at`, send the landing text if a phone
       was left, clear the phone.
   11. Insert `events` rows for both people.
3. **End visits** whose `leaves_at` has passed and are still `waiting`: claim by setting `left`,
   then start an empty return flight.
4. **Land returns.** Bird `home`, care settled, miles added. If it carried a note: set
   `delivered_at`, `apply_seeds(owner, 5, 'reply_home', flight.id)`, badge progress, notify the
   owner `reply-home` and the replier `reply-delivered`. Otherwise notify `home-empty`.
   Roll the found object from a hash of the flight id.
5. **Delay notices.** Flying flights whose plan has a major delay segment that has started and
   `delay_notified = false`: notify owner `delayed` and recipient `delayed-in`, set the flag.
6. **Roost notices.** Flying flights with more roost segments started (after the first flying
   segment) than `roosts_notified`: notify owner `roosting`, raise the counter.
7. **Finish jobs** whose `ends_at` has passed: claim by setting `done`, pay, roll the found
   object, set the bird `home`.
8. **Wake birds**: `busy` naps and baths whose `busy_until` has passed: apply the effect, set `home`.
9. **Hungry notices**: home birds whose computed belly is under 30 and `hungry_notified = false`.
10. **Expire guest links** past `expires_at`: set `expired`, set `notes.returned_at`, notify the sender.
11. **Send what is waiting**: notifications with no `push_sent_at` whose quiet hours have ended.

Starting a return flight (steps 3 and from `reply`): origin is the delivery's `to`, destination
is the owner's active loft adjusted for the same privacy rule, weather sampled now, hazards for
today, the bird's care as of now, a new flight id.

## Realtime

The browser subscribes with supabase-js to `postgres_changes` inserts on `public.events`
filtered by `user_id=eq.{me}`. On any row it calls `/api/sync`. That is the only direct
database access a browser has, and the policy limits it to the user's own rows.
