# T003. The Bird component

Phase: 0 Foundation  
Depends on: T002

## Goal

A React component that draws any bird in any pose and outfit, animated, by porting the Python rig.

## Read first

- `docs/08-design-system.md (Birds, Motion)`

## Looks like

- `reference/sheets/png/Pigeons.png` (and the `.html` beside it in `html/`)
- `reference/sheets/png/Gear.png` (and the `.html` beside it in `html/`)
- `reference/sheets/png/Motion.png` (and the `.html` beside it in `html/`)

## Build

- Port `reference/generator/rig.py` (`bird`, `fly`, `pose`, the `ON` and `ON_PRE` gear parts, the motion presets) and the palettes in `public/assets/data/birds.json` to `src/components/Bird.tsx`.
- Props: `look`, `breed`, `pose` (perched, sleep, eat, sulk, surprise, crouch, landed, proud, fly), `gear: string[]`, `animated`, `size`, `flip`, `title`.
- `<Takeoff>` and `<Landing>` components following `public/assets/rig-reference/takeoff.html`, played once, with the durations in docs/08.
- `<GearIcon id>` from `public/assets/svg/gear/icons`.
- A page at `/dev/birds` showing every look and breed in every pose, plus the six dressed examples.

## Done when

- [ ] Snapshot tests: for each file in `public/assets/rig-reference/*.svg`, rendering the component with the props in the file name produces the same SVG after normalising whitespace, attribute order and the embedded `<style>` block.
- [ ] With `animated={false}` no element has an animation style.
- [ ] With reduced motion the animated bird is still (covered by the global rule; assert the rule exists).
- [ ] `/dev/birds` matches `reference/sheets/png/Pigeons.png` and `Gear.png` by eye.
- [ ] Type check, lint and the whole test suite pass.

## Notes

- Do not redraw or 'improve' the birds. If the port cannot match a reference file, report which and why.
