# T008. Phone sign-in

Phase: 0 Foundation  
Depends on: T007, T002

## Goal

People can sign in with a phone number and a text code, and the server knows who is calling.

## Read first

- `docs/02-architecture.md (Sign-in)`
- `docs/07-screens.md (Hello, Phone, Code)`
- `docs/12-security-privacy.md (Accounts and sessions)`

## Looks like

- `reference/screens/png/Welcome.png` (and the `.html` beside it in `html/`)

## Build

- Supabase clients for browser and server with `@supabase/ssr`; middleware that refreshes the session and sends signed-out visitors of `(app)` routes to `/welcome`.
- Pages `/welcome` (Hello), `/sign-in`, `/sign-in/verify` with the copy in docs/07. Phone input normalises to E.164, default country +1.
- `requireUser()` returning `{ userId, profile | null }`; `not_onboarded` when the profile is missing or unfinished.
- A test auth module, enabled only when `APP_ENV=test`, that accepts code `000000` for numbers starting `+1555` and issues a session the same way.
- Sign out.
- Before coding, read the current Supabase docs for phone OTP and for `@supabase/ssr` with the App Router; the method names in this packet are from memory.

## Done when

- [ ] With the test auth module: a new number signs in and reaches onboarding; a wrong code shows 'That's not it. Try once more.'
- [ ] An `(app)` route without a session redirects to `/welcome`. An API route without a session returns `unauthenticated`.
- [ ] The test auth module cannot be enabled when `APP_ENV=production` or `VERCEL_ENV=production` (unit test).
- [ ] No phone number is written to any log (test with a spy logger).
- [ ] Type check, lint and the whole test suite pass.
