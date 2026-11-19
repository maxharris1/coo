# T004. Port the flight engine

Phase: 0 Foundation  
Depends on: T001

## Goal

The reference engine in the app, proven by its vectors.

## Read first

- `docs/05-flight-engine.md`

## Build

- Copy `reference/flight-engine/flightEngine.ts` to `src/lib/flight/engine.ts` unchanged.
- Port `flightEngine.test.ts` to vitest, reading `reference/flight-engine/vectors.json`.
- Add a test that `config/game.json` → `engine` deep-equals the engine's `CONFIG`.

## Done when

- [ ] All 35 engine tests pass under vitest.
- [ ] The config equality test passes.
- [ ] The engine file imports nothing and is byte-identical to the reference apart from line endings.
- [ ] Type check, lint and the whole test suite pass.
