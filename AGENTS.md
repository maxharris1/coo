# Rules for coding agents

You are building Coo from this packet. Follow these rules on every ticket.

## Working method

1. Do tickets in number order. Do not start a ticket whose dependencies are not done.
2. Before coding, read the ticket, then every doc it lists under "Read first".
3. Write the tests named in the ticket. A ticket is done when they pass, the whole test suite
   passes, type checking passes and lint passes.
4. Keep each ticket to its scope. If you find something missing, add a note under
   "Notes for the next ticket" in your summary. Do not build ahead.
5. If something in the packet is wrong or contradictory, stop and say so. Do not guess quietly.
6. Never weaken or delete a test to make it pass.

## Hard rules

- **Numbers come from `config/`.** No game number is typed into code. Import the JSON.
- **The flight engine is ported unchanged** from `reference/flight-engine/flightEngine.ts`.
  Its test vectors must keep passing. If a rule must change, change the engine, regenerate the
  vectors and update `docs/05-flight-engine.md` in the same ticket.
- **The server is the only authority.** Browsers never write game state and never query tables.
  They call the API. The one exception is the Realtime subscription to `events`.
- **Time comes from the clock module**, never `Date.now()` or `new Date()` in server code, and
  never `now()` inside SQL written by the app. Tests and the dev panel depend on this.
- **Every state change is one database transaction** and is safe to run twice.
  Use the claim pattern in `docs/06-api.md`.
- **Money-like things go through `apply_seeds`** with a reason and a reference id.
- **Never store or return an exact address or exact coordinates of a person.** Snap first
  (`docs/12-security-privacy.md`). Never log note bodies, phone numbers or link tokens.
- **A note is never lost.** No code path deletes a released note or strands a bird. (Cancelling a
  scheduled send before release is the one way a note is discarded.)
- **Looks come from the references.** Use `assets/tokens.css`, the SVGs in `assets/` and the
  motion classes in `assets/motion.css`. Do not redraw birds, invent colours or add a UI kit.
- **Copy comes from `config/copy/` and the mocks.** Follow `docs/14-content-voice.md` for new text.
- **External services sit behind ports** (`docs/02-architecture.md`). Tests use the fakes.
  No test may call the network.
- **Third-party APIs: read their current docs before you write the adapter.** Request formats
  in this packet were written from memory and are marked as such.
- **Dependencies:** only the ones listed in `docs/02-architecture.md`. Use the current stable
  release of each. Ask before adding another.

## Definition of done for a screen

- Matches its PNG in `reference/screens/png/` at 390 px wide: layout, colours, type, spacing.
- Works at 360 px and 430 px wide without clipped or overlapping text.
- Uses real data from the API, with loading, empty and error states.
- All tap targets are at least 44 px. Everything is reachable by keyboard and has a label.
- Animation respects `prefers-reduced-motion`.

## Summary to write when a ticket is finished

What you built, the tests you added and their result, anything you could not verify,
anything in the packet you found wrong, and notes for the next ticket.
