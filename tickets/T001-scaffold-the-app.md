# T001. Scaffold the app

Phase: 0 Foundation  
Depends on: nothing

## Goal

An empty Next.js app with the packet's folder layout, tooling and the packet's files in place.

## Read first

- `README.md`
- `AGENTS.md`
- `docs/02-architecture.md`

## Build

- Create a Next.js App Router project in TypeScript with `strict` on. Add eslint, prettier, vitest and the npm scripts `dev`, `build`, `typecheck`, `lint`, `test`.
- Create the folders in docs/02 'Folder layout'. Copy the packet's `config/` to `config/`, `assets/` to `public/assets/`, `assets/map/*` to `public/map/`, `supabase/` to `supabase/`, and keep `docs/`, `tickets/` and `reference/` in the repo.
- Add `.env.example` with every variable in docs/02 and no values. Add a typed `env.ts` that reads and validates them with zod and fails clearly when one is missing.
- Add `src/lib/config.ts` that imports every JSON file in `config/` with types, and builds the manifest name fields from `config/app.json`.
- A placeholder home page that shows the app name from config.

## Done when

- [ ] `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` all pass.
- [ ] A unit test asserts `config.app.name` equals the value in `config/app.json` and that every JSON file in `config/` loads.
- [ ] A unit test fails if any file under `src/` contains the literal product name instead of reading it from config (search for the string in `config/app.json` `name`, case-sensitive, excluding the config module).
- [ ] Type check, lint and the whole test suite pass.
