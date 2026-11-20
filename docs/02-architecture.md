# 02. Architecture

## Shape

One Next.js application on Vercel. One Supabase project for sign-in, the Postgres database and
a Realtime nudge. No other servers.

```
Browser (installed web app)
  |  pages, /api/* calls, MapLibre map, service worker for push
  v
Next.js on Vercel  --------------------->  Open-Meteo (weather)
  |  route handlers = the whole backend    Photon (place search and names)
  |  one Postgres connection pool          Twilio (text messages)
  v                                        Web push services (Apple, Google, Mozilla)
Supabase
  - Auth: phone number + text code
  - Postgres: all data
  - Realtime: "something changed" nudges on one table
  - Cron: calls /api/cron/tick every minute
OpenFreeMap: map tiles, fetched by the browser
```

## The one idea that makes it simple

**A flight is computed once and then only read.** When a bird is released the server gathers the
inputs (bird, gear, weather, hazards, endpoints, time), runs the flight engine and stores the
resulting plan: every flying, roosting and delayed segment with exact times. From then on:

- Browsers animate the bird by calling `positionAt(plan, now)` every frame. No position polling.
- The server needs to act only when a stored time passes: a landing, a delay starting, a visit ending.
- Two people watching the same flight see the same thing, because they hold the same plan.

The engine is pure and deterministic. It runs on the server and in the browser from the same file.

## Dependencies

Use the current stable release of each. Add nothing else without asking.

| Package | Used for |
|---|---|
| `next`, `react`, `react-dom`, `typescript` | The app. App Router. Strict TypeScript. |
| `@supabase/supabase-js`, `@supabase/ssr` | Sign-in, session cookies, the Realtime subscription. Nothing else. |
| `pg` | The server's database connection. |
| `zod` | Validating every request body and every external response. |
| `maplibre-gl` | The map. |
| `web-push` | Sending push notifications. |
| `vitest`, `@electric-sql/pglite` | Unit and database tests. No Docker needed. |
| `@playwright/test` | End-to-end tests. |
| `eslint`, `prettier` | Lint and format. |

No CSS framework, no component library, no state library, no ORM, no animation library.
Styling is CSS Modules on top of `assets/tokens.css`. State is React state plus one sync hook.
Twilio is called with `fetch`.

## Folder layout

```
config/                      copied from the packet, unchanged
public/
  assets/                    copied from the packet's assets/
  map/coo-day.style.json     map style (packet assets/map)
  sw.js                      service worker
  manifest.webmanifest
src/
  app/
    (public)/                /welcome, /sign-in, /b/[slug], /join/[code]
    (app)/                   everything behind sign-in; layout holds the tab bar and the sync provider
    api/**/route.ts          thin: check the user, validate with zod, call a service, return JSON
  components/                Button, Card, Chip, Header, TabBar, Sheet, Bird, GearIcon, MapView, ...
  lib/
    flight/engine.ts         the reference engine, unchanged
    game/                    pure rules: care.ts, seeds.ts, levels.ts, notes.ts, gear.ts, privacy.ts
    format.ts                times, distances, durations, pronouns, copy templates
  server/
    db.ts                    Db interface + pg adapter
    clock.ts                 now(), with the dev offset
    auth.ts                  requireUser()
    ports/                   Weather, Geocoder, Push, Sms interfaces
    adapters/                openMeteo.ts, photon.ts, webPush.ts, twilio.ts
    services/                one file per area: flights.ts, tick.ts, visits.ts, friends.ts, shop.ts, ...
  test/                      fakes, the PGlite adapter, fixtures
supabase/migrations/         from the packet
tests/e2e/                   Playwright
```

## Rules of the layering

- `lib/` is pure. No I/O, no clock, no randomness except through the engine's seeded generator.
  It is shared by server and browser.
- `server/services/` holds all behaviour. A service function takes `(deps, input)` where
  `deps = { db, clock, weather, geocoder, push, sms, config }`. It never imports an adapter.
- `app/api/` handlers contain no rules. They build `deps`, call one service, map errors to HTTP.
- Tests call services directly with fakes and a PGlite database. That covers nearly everything.

## Database access

```ts
export interface Db {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;   // BEGIN ... COMMIT, ROLLBACK on throw
}
```

- Production: `pg` Pool using `DATABASE_URL`, the Supabase connection pooler in transaction mode.
  Keep the pool small (max 5 per function instance). Do not use prepared statements by name.
- Tests: an adapter with the same interface over PGlite, loaded with
  `supabase/test/auth-stub.sql` then the migrations.
- SQL is written by hand with numbered parameters. No string building from user input.
- The server connects as the database owner, which bypasses row level security. Authorisation is
  therefore the service layer's job: every query that touches a user's data filters by the
  signed-in user's id. Tests must cover "someone else's id" for every endpoint.

## Sign-in

- The browser never calls Supabase Auth. The sign-in screens POST the number to
  `/api/auth/code` and the code to `/api/auth/verify`.
- The server calls `signInWithOtp({ phone })` and `verifyOtp({ phone, token, type: 'sms' })`
  through the `@supabase/ssr` server client. Supabase sends the code through Twilio.
  A good code sets the session in HttpOnly cookies.
- Between the two calls the number waits in an HttpOnly `coo_otp_phone` cookie, path
  `/api/auth`, for 10 minutes. It is never put in a URL. A good code clears it.
- `GET /api/auth/session` returns `{ userId, onboarded }`. `POST /api/auth/sign-out` signs out
  of Supabase and clears the session cookies. Both answer 401 without a session.
- `src/proxy.ts` refreshes the session on every request it matches.
- `requireUser()` reads the user id from the cookie session with `auth.getClaims()` and loads the
  `profiles` row. A user with no row is not onboarded. `requireOnboarded()` refuses them, and
  `/api/auth/verify` sends them to `/welcome/install`.
- Phone numbers stay in Supabase Auth. `profiles` holds only the last four digits, for display.

## Staying live

- `GET /api/sync` returns everything the open app needs in one response (`docs/06-api.md`).
- The sync provider calls it on load, on focus, every 20 seconds while visible, and at once when
  a Realtime row arrives on `events` for this user.
- `events` rows carry no content. They only say "refetch".
- If Realtime is down the app still works on the 20 second poll.

## Moving the world forward

`POST /api/cron/tick`, protected by `CRON_SECRET`, called every minute by Supabase
(`supabase/migrations/0002_cron.sql`). It runs the steps in `docs/06-api.md`. Vercel's own cron is
not used because the free plan allows one run per day.

The tick may be late or skipped. Correctness never depends on it running on time:
every step is "find rows whose time has passed and process them once", and `/api/sync` runs the
same processing for the calling user's own rows before it answers.

## Time

- `clock.now()` returns `Date.now()` plus the offset in `dev_clock`. In production the offset is
  ignored and must be zero.
- Every API response includes `serverNow`. The browser keeps the difference from its own clock
  and uses the corrected time for `positionAt`, countdowns and labels.
- Times are stored in UTC and shown in the viewer's time zone. Rules that need a local day
  (punch card week, daily caps, weekend bonus, quiet hours) use `profiles.timezone`, an IANA
  name the browser reports at sign-up and on each launch.

## Environment variables

| Name | What |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project and its publishable key |
| `DATABASE_URL` | Pooler connection string, transaction mode |
| `CRON_SECRET` | Shared secret for `/api/cron/tick` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web push keys |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | Text messages for landings |
| `LINK_TOKEN_PEPPER` | Mixed into guest link token hashes |
| `GEOCODER_URL` | Default `https://photon.komoot.io` |
| `WEATHER_URL` | Default `https://api.open-meteo.com` |
| `APP_ENV` | `development`, `preview`, `production` or `test`. Dev tools exist only outside production. `test` enables the test auth module and is refused when `VERCEL_ENV=production` |
| `VERCEL_ENV` | Set by Vercel. Test auth refuses to load when it is `production` |
| `TEST_AUTH_SECRET` | Signs the test auth session cookie. Only with `APP_ENV=test` |

Provide `.env.example` with every name and no values.

## Errors

Services throw `AppError(code, httpStatus, publicMessage)`. Handlers return
`{ "error": { "code": "...", "message": "..." } }`. Codes are listed in `docs/06-api.md`.
The public message is written in the product's voice and is safe to show. Anything unexpected is
logged with a request id and returned as code `internal`, status 500, with a generic message.
