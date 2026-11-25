# Coo: development packet

Packet version 1, 19 November 2026. Design canvas: https://claude.ai/artifact/C2tik3RpARNGU8GooDhTxP (private to Max; everything in it is exported here).

Everything needed to build Coo from an empty folder: a messenger where notes are carried by
virtual pigeons that take real time to fly real distances on a real map.

"Coo" is a working name. It lives in one file, `config/app.json`. See `docs/16-names.md`.

## Who this is for

AI coding agents, working one ticket at a time, with a person (Max) checking the result.
A human developer can use it the same way.

## How to use it

1. Read `AGENTS.md`. It is short and it is the rulebook.
2. Read `docs/00-overview.md`, then `docs/02-architecture.md`.
3. Work through `tickets/` in number order. Each ticket names the docs to read, what to build
   and the tests that must pass. `tickets/tickets.json` has the same list for tooling.
4. When a ticket and a doc disagree, the doc wins. When a doc and a mock disagree, the doc wins
   on behaviour and numbers; the mock wins on looks. Report the disagreement in your ticket notes.

## What is in here

| Folder | What it holds |
|---|---|
| `docs/` | The specification. Seventeen short documents. |
| `tickets/` | 48 ordered tickets with acceptance tests. |
| `config/` | Every tunable number, every item, every line of game copy, as JSON. Copy into the app unchanged. |
| `supabase/` | The database schema (tested), the cron job and a schema test. |
| `reference/flight-engine/` | The flight engine in TypeScript, working and tested, with 28 worked examples. Port it unchanged. |
| `reference/screens/` | All 29 designed screens as PNG and as standalone HTML you can open and click through. |
| `reference/sheets/` | The 10 design reference sheets: tokens, components, icons, birds, gear, illustrations, map, motion, app icon, voice. |
| `assets/` | Production assets: SVG birds in every pose, gear, icons, illustrations, map style, fonts, motion CSS, tokens. |

## What has been checked, and what has not

Checked by running it:

- The flight engine: 35 tests pass (`node --test reference/flight-engine/flightEngine.test.ts`, Node 22.18 or later).
- The schema: 9 tests pass against an in-process Postgres (`supabase/test/schema.test.mjs`).
- Every screen and sheet was rendered in Chrome and looked at.
- Every JSON file parses. Numbers in the docs were compared with the engine's output.

Not checked, so treat as a strong draft:

- `supabase/migrations/0002_cron.sql` (needs a real Supabase project).
- The map style against live tiles (`docs/09-map.md`, ticket T048).
- Third-party request formats quoted from memory: Open-Meteo, Photon, Twilio, web push.
  Each ticket that touches one says to confirm against the provider's current documentation.
- Nothing here has been built into a running app yet. The tickets are the plan, not a record.

`docs/15-open-items.md` lists what a person must decide or set up.
