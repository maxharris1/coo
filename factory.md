---
base_branch: main
tickets: github
builder:
  harness: claude
reviewer:
  harness: codex
review:
  rounds:
    low: 1
    high: 3
  verify: none
ship: merge
hold:
  approver: maxharris1
  paths:
    - supabase/migrations/**
    - .github/**
    - factory.md
    - src/middleware.ts
    - src/server/auth.ts
    - src/app/api/cron/**
shared_paths:
  - package.json
  - package-lock.json
  - supabase/migrations/
  - src/app/layout.tsx
feeder:
  max_holders_per_path: 1
skills: []
---

## Review
One reviewer from a different model family than the builder gives the final verdict. `review.verify` is `none`. Low-risk changes get one round; leftover minors are batched into a follow-up issue. High-risk changes get up to three rounds; I (Factory) may grant one extra round per finding, and any further round needs Max's own words.

Check every PR against `AGENTS.md` (the packet's rules for coding agents) and the ticket's acceptance criteria. Block on:
- `npm run typecheck`, `npm run lint`, `npm test` or `npm run build` failing, or a test weakened or deleted to make it pass.
- A game number typed into code instead of imported from `config/`.
- Any change to `src/lib/flight/engine.ts` that is not a byte-identical copy of `reference/flight-engine/flightEngine.ts`, unless the same PR regenerates the vectors and updates `docs/05-flight-engine.md`.
- Browser code that writes game state or queries tables directly (the Realtime subscription to `events` is the only exception).
- `Date.now()`, `new Date()` in server code, or `now()` in SQL written by the app, instead of the clock module.
- A state change outside one database transaction, or one that is not safe to run twice (claim pattern, `docs/06-api.md`); seeds moved without `apply_seeds`.
- Authorization done anywhere but the service layer, or a new endpoint/service without a test that calls it with someone else's id (another user's bird, flight, visit, note or link) and gets `not_found`/refused.
- An exact address or exact coordinates of a person stored, returned or logged; note bodies, phone numbers or link tokens logged.
- A test that calls the network, a new dependency not listed in `docs/02-architecture.md`, a UI kit, invented colours, or redrawn birds.
- A committed secret, key, token or `.env` value.

## Ship
`ship: merge` applies to PRs into `main`. On APPROVE of the covered head with green CI, squash-merge with `--match-head-commit`. PRs touching `supabase/migrations/**`, `.github/**`, `factory.md`, `src/middleware.ts`, `src/server/auth.ts` or `src/app/api/cron/**` are held for Max's OK. Never push to `main` directly.

## Context
- Coo is a pigeon messenger: one Next.js (App Router, strict TypeScript) app on Vercel and one Supabase project (Auth by phone, Postgres, Realtime). The spec packet lives in the repo: `README.md`, `AGENTS.md`, `docs/`, `tickets/`, `config/`, `assets/`, `reference/`, `supabase/`. Each issue names its packet ticket (`Packet ticket: T0NN`); read that ticket and every doc under its "Read first" before coding.
- Follow every rule in `AGENTS.md`. Hard rules, in short: numbers come from `config/`; the flight engine is ported unchanged; the server is the only authority (browsers call the API, never tables); time comes from the clock module; every state change is one transaction and safe to run twice; money-like things go through `apply_seeds`; never store or return exact addresses or coordinates (snap first), never log note bodies, phone numbers or link tokens; a note is never lost; looks come from `assets/` and the references; copy from `config/copy/` and the mocks; external services sit behind ports and tests use the fakes (no test may call the network); read current third-party docs before writing an adapter; only the dependencies in `docs/02-architecture.md`.
- The service layer does authorization. Every endpoint and service gets a test that uses someone else's id and is refused.
- CI commands: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` (and `npm run e2e` once T046 adds it). All must pass before a PR is ready. Until T001 lands `package.json`, CI only echoes a skip.
- Never commit secrets. Name environment variables only (`.env.example` lists names with no values); Max sets real values in Vercel and Supabase himself. Never apply migrations, change config or set secrets on a hosted Supabase, Vercel or Twilio project from an agent session; that is ops, tracked in plain issues Max closes.
- Risky areas: `supabase/migrations/`, auth and session middleware (`src/middleware.ts`, `src/server/auth.ts`), the cron tick (`src/app/api/cron/`), guest link tokens, account deletion.
- If something in the packet is wrong or contradictory, stop and say so in the PR instead of guessing.
- Builds for this project run on the PC only, never the Mac or the box (Max, 3:15 PM ET, 2026-11-19). The pin is set in the factory's own config, not here.
- PRs target `main`.
