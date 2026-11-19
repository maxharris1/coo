# T047. Deploy

Phase: 5 Settings, safety and polish  
Depends on: T046, T029

## Goal

A real address friends can open.

## Read first

- `docs/15-open-items.md`
- `docs/02-architecture.md (Environment variables)`

## Build

- Complete `docs/deploy.md`: Supabase project, migrations, phone provider, Vault secrets and cron, Vercel project and env vars, VAPID keys, domain, Twilio number, a smoke test list.
- A `scripts/smoke.ts` that checks health, sign-in page, a guest `not_found`, and the tick's freshness against a deployed address.
- Production guards: dev routes off, test auth off, clock offset ignored.

## Done when

- [ ] A person follows `docs/deploy.md` on fresh accounts and reaches a working app; every place they got stuck is fixed in the document.
- [ ] The smoke script passes against the deployed address.
- [ ] Two real phones complete: sign up, add friend, send, land, reply, home.
- [ ] Type check, lint and the whole test suite pass.
