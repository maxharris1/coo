# 04. Game rules

Every number here is in `config/game.json`, `config/gear.json` or `config/breeds.json`.
Code reads the config. This document explains what the numbers mean.

## 1. Starting out

A new account gets:

- 60 seeds (ledger reason `welcome`, reference the user id).
- 3 perches.
- 1 city pigeon. The user picks its look and name: 45 mph, focus 2, navigation 4, belly 80,
  feathers 80, energy 100, with one fear and one love from `config/quirks.json`.
- A second starter, a roommate the user adopts free from the Loft's roommate slot: 54 mph,
  focus 1, navigation 3, with the same care and quirks.
- The ankle bell and the bow tie in the closet.
- An egg that hatches after 5 deliveries.

## 2. Notes

- A note is text, a finger doodle, or both. It must have some text or a doodle.
- Text is plain. Trim whitespace. Count characters by Unicode code point.
- Text limit 140. 280 if the carrying bird wears the roomy tube. A Pouter doubles its limit
  (280, or 560 with the tube); the app shows the overflow as a second card. The tube and the
  Pouter add room for words only.
- A doodle is the same size for every bird. It is a list of strokes on a 300 by 200 canvas, with
  the stroke, point and size limits in `config/game.json` under `notes.doodle`. Points are whole
  numbers inside the canvas. A lone point is a dot.
- Stroke colours are palette names only: `ink` (the default), `stamp`, `tomato`, and `sun`, `sky`
  and `mint` drawn with an ink outline so they read on the card. Widths are `fine` and `marker`,
  both a chunky felt tip. The app never accepts hex colours, SVG or a picture.
- A slight ink wobble is baked into the saved points when a stroke is finished. It is not added
  again when the doodle is drawn.
- Screen readers announce a doodle as "A doodle", or "A doodle in {colors}" when it uses colours
  other than ink. There is no caption.
- A reply uses the limit of the bird it rides on.
- No editing, no unsending. A scheduled send can be cancelled until it is released.

## 3. Who can receive a note

- A friend (an `accepted` friendship, not blocked).
- A guest, through a link the sender creates (`docs/11-guest-links.md`).
- Up to 5 recipients per send. Each recipient takes one bird. One note body, one flight each.

## 4. Where birds fly from and to

Every user has an active loft (travel loft if the travel switch is on, home otherwise), stored
snapped to a grid of 0.002° latitude by 0.0025° longitude, about 200 m: `round(lat / 0.002) × 0.002`,
`round(lon / 0.0025) × 0.0025`, each then rounded to 4 decimal places. That point is the roost.

For a flight between users X and Y, each endpoint depends on what that person lets the other see:

- X lets Y see `block`: X's endpoint is X's roost.
- X lets Y see `city`: X's endpoint is the centre of X's city.

Both ends follow this rule independently. If both are in the same city and both show only the
city, the distance is zero and the note arrives at once. That is acceptable.

For a guest link, the destination is the snapped point the sender chose and the origin is the
sender's roost.

Endpoints are fixed at release. Turning the travel switch on or off later does not move birds
already in the air. A return flight is aimed at the owner's active loft at the moment it starts.

The travel switch can change at most once every 12 hours. Birds at home come along instantly.

## 5. Release

A bird can be released if it is `home`, its energy is at least 15, and its owner has not used
40 flights today. On release the server:

1. Works out the endpoints.
2. Samples the weather now at three points along the route, at fractions 1/6, 1/2 and 5/6.
   If the weather service fails, uses calm and 55°F and says so in the flight log.
3. Works out hazards for today with `hazardsFor` (hawk 15% of route-days, street fair 25% of
   weekend route-days).
4. Computes the bird's current care values and whether it is sulking.
5. Runs the engine with a new flight id and stores input and plan.
6. Marks the bird `flying`.

A scheduled send reserves the bird (`scheduled`) and does steps 1 to 6 when its time comes,
with the weather of that moment. Sends can be scheduled up to 24 hours ahead.

## 6. The flight

Fully described in `docs/05-flight-engine.md`. In short:

- Birds fly great-circle routes at their speed, adjusted for level, mood, weather and wind.
- Birds fly only while the sun is up where they are. Otherwise they roost and resume at sunrise.
  The exception is a bird wearing night-vision goggles. It flies through the dark and does not
  roost, at 0.03 lower arrival odds.
- Each flight has arrival odds. That share of flights go straight through. The rest are delayed:
  80% by 4 to 25 minutes, 20% by 1 to 5 hours. Good navigators shorten delays.
- The note always arrives.

### Search party

During a major delay the sender may send one search party per flight for 20 seeds.
It succeeds 7 times in 10 and ends the delay 10 to 60 minutes from now (never later than the
delay would have ended anyway). The result is fixed by the flight id, so it cannot be re-rolled.
Either way the seeds are spent.

## 7. Landing a delivery

When a delivery's arrival time passes (see the transaction in `docs/06-api.md`):

- The note becomes readable. The recipient is notified.
- The bird sits on the recipient's sill for 30 minutes (`visits`).
- The bird's record and care are updated: miles, deliveries, detours (if it was delayed),
  energy −8 per hour flown and +5 per hour roosted, feathers −15 if any third had rain and the
  bird wore no booties.
- The sender is paid (section 10), the punch card advances, a new city earns a postmark.
- The sender's delivery count rises, which may make an egg ready.

## 8. The sill, replies and the trip home

While a bird waits:

- **Reply.** The host writes a note and sends the bird home with it. This costs the host nothing
  and uses none of the host's birds. The return flight starts at once.
- **Snack.** Once per visit the host may pay 5 seeds. The bird's belly rises by 40. The owner
  receives a tip of 5 seeds, +1 if the bird wears the bow tie, doubled if it is a Fantail
  (so 5, 6, 10 or 12).
- **Nothing.** After 30 minutes the bird starts home with no note.

A host may also answer with one of their own birds instead. That is an ordinary send.

The return flight uses the same engine: weather sampled at its start, daylight, odds, delays.
When it lands the bird is `home`. If it carried a reply, the owner gets the reply, 5 seeds and
progress on the RFC 1149 badge. There is a 1 in 10 chance the bird brings home a found object.

## 9. Care

Three values, 0 to 100, stored with a timestamp and computed when read:

| Value | Changes |
|---|---|
| Belly | −2 per hour, always. Feed: +50 for 3 seeds. Snack from a host: +40. |
| Feathers | −1 per hour (−0.5 with the rooftop birdbath). −15 after a rainy flight without booties. Bath: back to 100, bird busy 10 minutes, free. |
| Energy | At home: +10 per hour. Flying: −8 per hour (−4 for a King). Roosting on a trip: +5 per hour. Nap: +50, bird busy 30 minutes, free. |

An owner can wake a napping bird early. It comes home at once with the energy gained so far and
no +50. A bird still under 15 energy stays unable to fly.

All values clamp to 0–100. While a bird is away its belly and feathers keep draining by the
hour; energy is settled at landing.

Effects:

- Belly under 30: hungry, −6% odds. Feathers under 30: scruffy, −3% odds. Energy under 40: tired, −10% odds.
- Energy under 15: the bird refuses to fly.
- Not fed for 72 hours: sulking, flies 10% slower. Feeding ends it at once. A bird never leaves and never dies.
- When belly crosses below 30 the owner gets one "hungry" notification. The flag resets on feeding.

`lib/game/care.ts` exports `careAt(bird, nowMs, owner)` returning current values and flags.
Worked example: belly 80 at noon, read at 9 pm the next day (33 hours): 80 − 66 = 14, hungry.

## 10. Seeds

Earned:

| For | Seeds |
|---|---|
| A delivery lands | 10 + 1 per full 25 miles. First 10 deliveries of the owner's local day. After that, 2 each. |
| ...wearing the party hat, landing on Saturday or Sunday (owner's time zone) | +5 |
| A bird comes home with a reply | 5 |
| First delivery to a new city | 25, and a postmark |
| Tenth delivery in a Monday-to-Sunday week | 50 (punch card), once per week |
| Odd job | Its pay. Full for the first 3 jobs of the day, half (rounded down) for the next 3, then no more jobs today |
| Trading found objects | Each object's value |
| Tip | 5, +1 with bow tie, ×2 for a Fantail |

Spent:

| On | Seeds |
|---|---|
| Feed | 3 |
| Snack for a visiting bird | 5 |
| Search party | 20 |
| Gear | 60 to 200, see `config/gear.json` |
| Rooftop birdbath | 220 |
| Perch 4, perch 5 | 250, 400 |

Example: Brooklyn to Philadelphia is 81 miles. 10 + floor(81 / 25) = 13 seeds.

## 11. Gear

Fourteen items for sale, fifteen in the catalog (the tiny backpack is coming later), four slots
(head, neck, leg, back), one item per slot per bird.
The closet belongs to the user. Any of their birds can wear any item, one bird at a time.
Gear can be changed only on a bird that is `home`. Exact effects are the `rule` field in
`config/gear.json`; the engine implements the ones marked `engine:`.

Note the two neck items that matter in bad weather cannot be combined with each other, and
neither can the beanie and either pair of goggles. Choosing is the game.

## 12. Levels

`level = min(10, 1 + floor(sqrt(miles / 25)))`. So level 2 at 25 miles, 3 at 100, 4 at 225,
5 at 400, 10 at 2,025. Each level above 1 adds 1% speed. All miles count, out and home.
Shown as "Level 4 city pigeon".

"Range before a rest" on the bird's page is for show: speed × 7.1, rounded to the nearest 10 miles.

## 13. Odd jobs and found objects

- Two jobs are offered at a time, chosen from `config/jobs.json` by a hash of user id and local date.
- Sending a `home` bird makes it busy for the job's minutes. When the time passes the owner is
  paid and, 1 time in 4, the bird brings back a found object (chosen by a hash of the job id).
- Found objects sit on the Earn screen until traded. "Trade" sells all of them at once.
- Jobs use the map. Starting a job stores a snapped destination as far from the loft as the bird
  flies in half the job's minutes. The owner watches the bird on `/jobs/[id]` fly out to it until
  the midpoint and back home by `ends_at`.
- Jobs do not use the flight engine, the weather or the 30-minute sill. The job's minutes alone
  set when the bird is home. There are no delays, odds or search party.

## 14. Eggs, breeds and perches

- There is always exactly one egg. The first hatches when the owner's delivery count reaches 5;
  each later one 25 deliveries after the previous hatch.
- When the count is reached the egg is `ready`. It hatches when the user opens it and has a free
  perch. With no free perch it waits, and the Aviary says so.
- The hatchling's breed is picked at random from hatchable breeds the user does not own yet;
  if they own all six, from all six. Its abilities are rolled inside the breed's ranges.
  The roll is seeded by the egg id.
- The user names it and picks a pronoun. Then the next egg appears.
- Breed traits are the `rule` field in `config/breeds.json`.

## 15. Postmarks, badges, birds met

- Postmark: the first time one of your deliveries lands in a city (city, region, country from
  the place lookup of the destination). Fifty slots are shown; there is no fixed list.
- Badges: twelve, in `config/badges.json`, each with a rule and a goal.
- Birds met: distinct birds that have landed on your sill.

## 16. Limits

`config/game.json` → `limits`. 40 flights a day, 5 recipients a send, 5 guest links a day,
150 friends, 30 place searches a minute, 10 reports a day. Over a limit, the API answers
`rate_limited` with a friendly line.
