# T005. Pure game rules

Phase: 0 Foundation  
Depends on: T004

## Goal

Every rule that is not the flight engine, as pure tested functions in `src/lib/game/`.

## Read first

- `docs/04-game-rules.md`

## Build

- `care.ts`: `careAt(bird, nowMs, { hasBirdbath })` → current belly, feathers, energy and the flags hungry, scruffy, tired, sulking, canFly. `settleFlight(bird, plan, input)` → care after a flight. `feed`, `snack`, `bathDone`, `napDone`.
- `levels.ts`: `levelFor(miles)`, `rangeFor(speed)`.
- `seeds.ts`: `deliveryPay(distanceMi, deliveriesPaidToday, { partyHat, landedLocalWeekday })`, `tipFor(bird)`, `jobPay(job, jobsDoneToday)`.
- `notes.ts`: `noteLimit(bird)`, `validateBody(text, limit)` counting code points after trimming.
- `gear.ts`: `validateOutfit(items, closet, otherBirds)` enforcing one per slot, owned, available, not worn elsewhere.
- `privacy.ts`: `snap(lat, lon)`, `activeLoft(profile)`, `endpointFor(viewerShows, profile)`.
- `eggs.ts`: `rollHatchling(eggId, ownedBreeds)` seeded by the egg id. `jobs.ts`: `offersFor(userId, localDate)`, `foundObjectFor(sourceId, chance)`.
- `time.ts`: local day, Monday week start and weekday for an IANA zone; `inQuietHours`.

## Done when

- [ ] Care: belly 80 read 33 hours later is 14 and hungry. Feathers drain half as fast with the birdbath. Unfed 72 hours → sulking; feeding clears it. Energy under 15 → cannot fly.
- [ ] Settle: a 2 hour dry flight costs 16 energy; a rainy one costs 15 feathers unless booties; a King pays half the energy.
- [ ] Levels: 0→1, 24.9→1, 25→2, 100→3, 225→4, 2025→10, 99999→10. Range for 45 mph is 320.
- [ ] Pay: 81 miles → 13; the 11th delivery of the day → 2; party hat on a Saturday → +5. Tips: 5, bow 6, fantail 10, fantail with bow 12.
- [ ] Notes: 140 base, 280 tube, pouter 280, pouter with tube 560; an emoji counts once; whitespace-only is invalid.
- [ ] Gear: two head items rejected; unowned rejected; backpack rejected; an item on another bird rejected.
- [ ] Snap: (40.71427, -73.96143) → (40.714, -73.9625). Every function is deterministic (same inputs twice give equal outputs).
- [ ] Type check, lint and the whole test suite pass.
