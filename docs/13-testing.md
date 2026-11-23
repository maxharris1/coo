# 13. Testing

## Layers

| Layer | Tool | What it covers | Speed |
|---|---|---|---|
| Pure rules | vitest | The engine (vectors), care, seeds, levels, note limits, gear rules, privacy endpoints, formatting | milliseconds |
| Services | vitest + PGlite + fakes | Every service function against a real Postgres in memory, with fake clock, weather, geocoder, push and SMS | under a second each |
| Schema | the same | The migration applies; constraints and policies hold (`supabase/test/schema.test.mjs`, port it) | seconds |
| End to end | Playwright | Six journeys in a real browser against a local server with fakes and the test clock | a minute or two |
| Looks | by eye | Each screen against its reference PNG | per ticket |

No test touches the network. No test sleeps. No test depends on the real time.

## Fakes

- `FakeClock`: `now()`, `advance(ms)`, `set(ms)`.
- `FakeWeather`: returns calm unless told otherwise; `set(sample)`, `failNext()`.
- `FakeGeocoder`: a small table of places (the five in the engine vectors plus a few neighbourhoods).
- `FakePush`, `FakeSms`: record what was sent; `failNext(code)`.
- `testDb()`: a fresh PGlite with the stub and migrations applied. Build it once per file and
  wrap each test in a transaction that rolls back, or rebuild per test if that is simpler.
- `seedWorld()`: Max and Priya as friends 82 miles apart, Rosa two miles away, each with birds.
  Start every service test from it.

## The scenarios that must exist

These are the heart of the product. Each is a service-level test using the fake clock.

1. **There and back.** Max releases Gerald to Priya. Before arrival Priya's sync has the flight
   and no note body. Advance past arrival, tick. The note is delivered, the visit exists, Max
   has been paid 13 for the delivery and 25 for the new city (38 in all, the first time), both were notified once. Tick again: nothing changes. Priya replies.
   Advance past the return, tick. Gerald is home, Max has the reply and 5 more seeds.
2. **No reply.** As above, but advance 30 minutes after landing and tick. An empty return flight exists.
3. **Overnight.** A flight to Chicago released in the afternoon has a roost segment; the owner
   gets one roosting notice; arrival is the next day.
4. **Delay and search party.** With a flight id known to roll a major delay: the delay notice
   goes out once; a search party costs 20 seeds; with a found result the arrival moves earlier;
   a second search party is refused.
5. **Scheduled.** A send scheduled for 7 am reserves the bird; cancelling frees it; otherwise
   the tick releases it with the weather of that moment.
6. **Guest.** A guest flight creates a link; the public endpoint hides the note until landing
   and shows it after; a wrong token is `not_found`; claiming makes the friendship and moves the
   visit; an unopened link expires after 7 days and the sender is told.
7. **Privacy.** A friend set to city level gets the city centre as the endpoint, in the quote,
   in the flight and in sync. A non-friend cannot quote or send.
8. **Twice is once.** Run the landing step twice in parallel for the same flight: one visit,
   one payment, one notification each.
9. **Money.** Buying without enough seeds fails and changes nothing. The ledger always sums to the balance.
10. **Care.** A bird unfed for 72 hours is sulking and its next plan is slower; feeding fixes it.
11. **Eggs.** The fifth delivery makes the egg ready; hatching needs a free perch; the next egg
    is set 25 deliveries on.
12. **Other people's things.** Every endpoint called with another user's bird, flight, visit or
    friend id answers `not_found` or `forbidden`.

## End-to-end journeys

1. Sign up (fake code), name a bird, install step skipped, set a loft, land on Main.
2. Two browsers: add a friend by invite link.
3. Send a note, watch the tracker, skip time, see it land in the other browser, reply, skip time,
   see the reply at home.
4. Send to someone new, open the link in a third browser signed out, skip time, read the note,
   claim it.
5. Feed, dress and rename a bird; buy an item.
6. Do an odd job, skip time, collect; open Collection and Aviary.

Sign-in in tests: `APP_ENV=test` swaps the auth module for one that accepts code `000000` for
numbers starting `+1555`. This switch must be impossible to enable in production
(check `APP_ENV` and `VERCEL_ENV`).

## Checks in every ticket

`npm run typecheck`, `npm run lint`, `npm test`. From T046 on, also `npm run e2e`.
