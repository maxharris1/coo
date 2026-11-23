# 05. The flight engine

The engine is `reference/flight-engine/flightEngine.ts`. It works and is tested. **Port the file
unchanged** to `src/lib/flight/engine.ts` and port its test. This document explains it so you
can use it correctly and change it safely.

## Contract

```ts
computeFlightPlan(input: FlightInput): FlightPlan
positionAt(plan, from, to, ms): { lat, lon, frac, state }
onTimeOdds(input, distanceMi, inDark): number
fliesInDark(input): boolean
groundSpeedMph(input, third, routeBearing): number
hazardsFor(departAtMs, from, to, localWeekend): { hawk, fair }
searchParty(flightId, nowMs): number | null
sunTimes(ms, place): { sunriseMs, sunsetMs }        // for labels only
```

- Pure. No clock, no network, no global state. Same input, same output, on any machine.
- All randomness comes from the flight id through a seeded generator (FNV-1a hash into mulberry32).
- Times are epoch milliseconds, UTC. Distances are miles. Speeds are miles per hour.

## Inputs

`FlightInput` holds: `flightId`, `from`, `to`, `departAtMs`, the bird's state at release
(`speedMph`, `focus`, `navigation`, `level`, `belly`, `feathers`, `energy`, `sulking`, `breed`),
the `gear` ids it wears, three `weather` samples (first, middle and last third of the route),
optional `hazards`, optional `delayEndOverrideMs` (set after a successful search party), and
optional `nightFlightUntilMs` (the bird may fly in the dark until this moment).

The server builds this once, at release, and stores it in `flights.input`.

The server sets `nightFlightUntilMs` only when the sender spends an Espresso shot (see
`docs/04-game-rules.md` section 6). It runs the engine once without the field and without a
delay, and sets the field to the end of the first `roost` segment, the sunrise that ends the
first night. It never sets the field for a bird wearing `nightgoggles` or a route that never
roosts. The quote builds its `espresso` variant the same way. The rule lives in
`src/server/services/flights/espresso.ts`.

## Step 1: distance and bearing

Great-circle distance by the haversine formula on a sphere of radius 3,958.7613 miles.
Initial bearing by the standard formula. `interpolate(from, to, f)` gives the point a fraction
`f` along the great circle. The bird's path on the map is that great circle.

## Step 2: speed in each third

For each third of the route:

1. Start with `speedMph × (1 + 0.01 × (level − 1))`, times 0.9 if sulking.
2. Rain of 4 mm/h or more: ×0.7, unless wearing the rain hat.
   Otherwise rain of 0.5 mm/h or more: ×0.85, unless goggles, rain hat or a Frillback.
3. Below 32°F: ×0.8, unless beanie or scarf.
4. Snow: ×0.7, unless scarf.
5. Wind: `headwind = windMph × cos(windFromDeg − routeBearing)`. Subtract `0.45 × headwind`
   (a tailwind is a negative headwind, so it adds). With the captain's cap a headwind uses 0.30.
6. Never below 8 mph.

## Step 3: arrival odds

Start at `0.85 + 0.03 × focus`. Then:

| Condition | Change |
|---|---|
| Belly under 30 | −0.06 |
| Feathers under 30 | −0.03 |
| Energy under 40 | −0.10 |
| Rain in any third, no rain hat (a Frillback ignores this unless it is a downpour) | −0.06 |
| Hawk advisory | −0.04, or −0.02 with the bandana |
| Street fair, no earmuffs, not a Jacobin | −0.03 |
| Lucky leg band | +0.03 |
| Flies in the dark (night goggles, or before `nightFlightUntilMs`), judged on the walk without a delay | −0.03 |
| Distance | −0.01 per full 100 miles beyond the first 100, at most −0.10 |

`fliesInDark(input)` decides the dark row. It walks the route as in step 5 with no delay and is
true at the first dark minute the bird flies. The odds must be known before the delay is rolled,
so this is an approximation: if a delay pushes a daylight flight past sunset, a bird with night
goggles flies on and takes no −0.03.

Clamp to 0.40–0.99 and round to two places. This is the "arrival odds" shown before release:
the chance of arriving without a delay. It is never the chance of arriving at all, which is 1.

## Step 4: the dice

Five numbers are drawn from the generator, always, in this order: `rOnTime`, `rMajor`, `rFrac`,
`rLen`, `rFlavor`.

- Delayed if `rOnTime >= odds`.
- If delayed: major if `rMajor < 0.2`, otherwise minor.
- Length: minor 4 to 25 minutes, major 60 to 300, chosen by `rLen`, then multiplied by
  `1.3 − 0.1 × navigation` and rounded to a whole minute.
- The delay happens when the bird reaches fraction `0.15 + 0.70 × rFrac` of the route.

## Step 5: walking the route

Starting at departure with fraction 0, repeat until fraction 1:

1. If a delay is due (fraction has reached the delay point): add a `delay` segment of the delay
   length, or ending at `delayEndOverrideMs` if that is earlier. Continue.
2. If the sun is not up at the bird's current position (altitude at or below −0.833°, or −6°
   for a King): add one minute of `roost`, unless the bird wears `nightgoggles` or the time is
   before `nightFlightUntilMs`. Continue.
3. Otherwise fly for one minute at the speed of the current third. If that would pass the delay
   point or the destination, fly only the exact part needed. A bird flying in the dark without
   `nightgoggles` also stops flying at `nightFlightUntilMs`, so it roosts from that moment.

Neighbouring segments of the same kind are merged. The arrival time is where the loop ends.
A bird released at night waits at the loft until sunrise. There is a 30 day safety limit.

The sun's position uses the same compact formulas as the well-known SunCalc library.
It is accurate to a minute or two, which is plenty.

## Step 6: flight log events

The plan carries a list of `{ atMs, kind, pick }`:

- `takeoff` at departure, `landing` at arrival.
- `nightwait` if released in the dark. `dusk` and `sunrise` around each roost.
- `delay` at the start of a delay.
- One flavour event (`cruising`, `food` or `landmark`) per started hour of flying plus one,
  at most six, spread across the flying time.
- One `weather` event in the first flying segment if any third has rain, snow, cold or wind of 12 mph or more.

`pick` chooses the line: `lines[pick % lines.length]` from `config/copy/flight-log.json`.
For `weather`, the client chooses the group (rain, snow, cold, headwind or tailwind, and the
`_geared` variant if the bird wears the matching item) from the stored input.
For `delay`, use `delay_minor` or `delay_major` by the plan's `delayKind`.
An event is shown once the clock has passed its time.

## Using the plan

- `positionAt` returns the bird's position, the fraction flown and a state: `waiting`, `flying`,
  `roosting`, `delayed` or `landed`. Call it every animation frame with server-corrected time.
- "Lands in" is `arriveAtMs − now`. "Takes off again" is the end of the current roost segment.
- For the forecast screen, run the engine with forecast weather for each candidate hour and a
  throwaway flight id, and show `onTimeOdds` and the no-delay duration. To get the no-delay
  duration, compute the plan and subtract the delay segment's length.
- After a successful search party, recompute with the same input plus `delayEndOverrideMs`,
  and store the new plan and arrival time.

## Worked examples

All from New York's East Village on Thursday 19 November 2026 at 10:00 am local time unless
noted, with a 45 mph, focus 2, navigation 4, level 1 city pigeon. Sunset that day is 4:36 pm.
Full inputs and outputs are in `reference/flight-engine/vectors.json`.

| Vector | What it shows | Miles | Time | Odds | Delay |
|---|---|---|---|---|---|
| `calm-short` | New York to Philadelphia, calm, no gear | 82.1 | 1h 49m | 0.91 | none |
| `lucky-band` | Same flight wearing the lucky leg band: odds 0.94 | 82.1 | 1h 49m | 0.94 | none |
| `headwind` | 14 mph wind from the southwest, straight on the beak | 82.1 | 2h 07m | 0.91 | none |
| `headwind-cap` | Same headwind with the captain's cap | 82.1 | 2h 01m | 0.91 | none |
| `tailwind` | 14 mph wind from the northeast, pushing him along | 82.1 | 1h 36m | 0.91 | none |
| `rain-bare` | Light rain, no gear: slower and lower odds | 82.1 | 2h 09m | 0.85 | none |
| `rain-goggles` | Light rain with goggles: full speed, odds still lower | 82.1 | 2h 05m | 0.85 | minor |
| `downpour-rainhat` | Downpour with the rain hat: no effect at all | 82.1 | 1h 49m | 0.91 | none |
| `downpour-bare` | Downpour, no gear | 82.1 | 2h 36m | 0.85 | none |
| `snow-bare` | Snow at 28F, no gear: cold and snow both apply | 82.1 | 3h 15m | 0.91 | none |
| `snow-scarf` | Snow at 28F with the thermal scarf | 82.1 | 1h 49m | 0.91 | none |
| `mixed-thirds` | Different weather in each third of the route | 82.1 | 2h 05m | 0.85 | none |
| `hazards` | Rain, hawk and street fair with the lucky band: odds 0.81 | 82.1 | 2h 26m | 0.81 | minor |
| `hazards-geared` | Hawk and street fair wearing the bandana: the hawk penalty is halved | 82.1 | 1h 49m | 0.86 | none |
| `hungry-tired-dirty` | A neglected bird: belly 20, feathers 20, energy 30, sulking | 82.1 | 2h 02m | 0.72 | none |
| `level-6` | Level 6 bird is 5 percent faster | 82.1 | 1h 44m | 0.91 | none |
| `block` | East Village to Williamsburg, about two miles | 2.2 | 0h 03m | 0.91 | none |
| `boston` | New York to Boston | 188.7 | 4h 12m | 0.91 | none |
| `chicago-overnight` | New York to Chicago: one night in a barn | 711.8 | 30h 06m | 0.85 | none |
| `la-many-nights` | New York to Los Angeles: several nights, distance penalty capped | 2446.5 | 124h 56m | 0.81 | none |
| `night-release` | Released at 10 pm: waits at the loft until sunrise | 82.1 | 10h 38m | 0.91 | none |
| `king-twilight` | A King pigeon to Chicago flies a little later into dusk | 711.8 | 29h 05m | 0.85 | none |
| `frillback-drizzle` | A Frillback ignores light rain entirely | 82.1 | 1h 49m | 0.91 | none |
| `jacobin-fair` | A Jacobin ignores the street fair | 82.1 | 1h 49m | 0.99 | none |
| `delay-minor` | A flight id that rolls a minor delay | 82.1 | 2h 07m | 0.88 | minor |
| `delay-major` | A flight id that rolls a major delay | 82.1 | 5h 10m | 0.91 | major |
| `delay-major-poor-navigator` | Same major delay, navigation 1: the delay is longer | 82.1 | 6h 17m | 0.91 | major |
| `delay-major-search-party` | Same major delay ended early by a search party | 82.1 | 2h 09m | 0.91 | major |
| `night-release-nightgoggles` | Released at 10 pm wearing night goggles: flies through the dark at once | 82.1 | 1h 49m | 0.88 | none |
| `chicago-nightgoggles` | New York to Chicago wearing night goggles: no barn, flies through the night | 711.8 | 16h 04m | 0.82 | minor |
| `la-first-night` | New York to Los Angeles, may fly in the dark until the first sunrise: flies through the first night only | 2446.5 | 97h 25m | 0.78 | none |

Things worth noticing:

- Calm, no gear: 82.1 miles at 45 mph is 1 h 49.5 min. Odds 0.85 + 0.06 = 0.91.
- A 14 mph headwind costs 0.45 × 14 = 6.3 mph, so 38.7 mph and 2 h 07 min.
- Light rain costs speed and odds. Goggles give the speed back but not the odds. The rain hat gives both.
- Chicago: he flies until dusk in Pennsylvania, sleeps 14 hours, and lands the next afternoon. 30 hours for 712 miles.
- Released at 10 pm: 9 hours asleep on the note, then a normal flight.
- Released at 10 pm wearing night goggles: no wait at the loft, he lands 1 h 49.5 min later. Flying in the dark costs 0.03, so odds are 0.91 − 0.03 = 0.88.
- Chicago wearing night goggles: no barn, he flies through the night and lands 16 h 04 min after takeoff instead of 30 h 06 min. That includes a 15 minute minor delay this flight id rolls. Odds are 0.85 − 0.03 = 0.82.
- Los Angeles with `nightFlightUntilMs` at the loft's first sunrise, close to what an Espresso shot sets: he flies through the first night only and roosts on later nights. 4 roosts instead of 5, and he lands 97 h 25 min after takeoff instead of 124 h 56 min. Odds are 0.81 − 0.03 = 0.78. At the cutoff he is over northern Missouri, where the sun is not up yet, so he roosts 69 minutes until it rises there.
- The same major delay is 3 h 21 min for a good navigator, 4 h 28 min for a poor one, and 20 minutes after a search party.

## Changing the engine

1. Change `flightEngine.ts` and `CONFIG`.
2. Run `node gen-vectors.mjs` and read the printed table. Make sure the change did what you meant
   and nothing else moved.
3. Run the tests.
4. Update this document and `config/game.json` → `engine`.

Plans already stored are never recomputed with a newer engine, except after a search party,
so a change does not disturb birds in the air unless someone sends a search party after them.
To be safe, store `engineVersion` in `flights.input` and keep search-party recomputation on the
version the flight started with if the engine ever changes in production.
