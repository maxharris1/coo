import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import { rollHatchling } from "@/lib/game/eggs";
import type { BreedId } from "@/lib/game/types";

const hatchable: BreedId[] = [
  "fantail",
  "pouter",
  "frillback",
  "jacobin",
  "king",
  "tumbler",
];
const eggIds = Array.from({ length: 200 }, (_, i) => `egg-${i}`);
const stats = ["speedMph", "focus", "navigation"] as const;

const ownedSubsetsLeavingOne = Array.from({ length: 63 }, (_, mask) =>
  hatchable.filter((_, bit) => mask & (1 << bit)),
);

describe("rollHatchling", () => {
  it("hatches a hatchable breed the owner does not have yet", () => {
    for (const owned of ownedSubsetsLeavingOne) {
      for (const id of eggIds) {
        const { breed } = rollHatchling(id, owned);
        expect(hatchable).toContain(breed);
        expect(owned).not.toContain(breed);
      }
    }
  });

  it("picks from all six once every hatchable breed is owned", () => {
    const seen = new Set<BreedId>();
    for (const id of eggIds) seen.add(rollHatchling(id, hatchable).breed);
    expect([...seen].sort()).toEqual([...hatchable].sort());
  });

  it("never hatches a city pigeon, even for an owner of only city pigeons", () => {
    for (const id of eggIds) {
      expect(rollHatchling(id, ["city"]).breed).not.toBe("city");
      expect(rollHatchling(id, [...hatchable, "city"]).breed).not.toBe("city");
    }
  });

  it("rolls whole stats inside the breed's ranges and reaches both ends", () => {
    const seen = new Map<string, Set<number>>();
    for (const owned of ownedSubsetsLeavingOne) {
      for (const id of eggIds) {
        const egg = rollHatchling(id, owned);
        const ranges = config.breeds.breeds.find((b) => b.id === egg.breed)!;
        for (const stat of stats) {
          const [lo, hi] = ranges[stat];
          expect(Number.isInteger(egg[stat])).toBe(true);
          expect(egg[stat]).toBeGreaterThanOrEqual(lo);
          expect(egg[stat]).toBeLessThanOrEqual(hi);
          const key = `${egg.breed}:${stat}`;
          seen.set(key, (seen.get(key) ?? new Set()).add(egg[stat]));
        }
      }
    }
    for (const breed of config.breeds.breeds.filter((b) => b.hatchable)) {
      for (const stat of stats) {
        const values = seen.get(`${breed.id}:${stat}`)!;
        expect(values).toContain(breed[stat][0]);
        expect(values).toContain(breed[stat][1]);
      }
    }
  });

  it("gives equal outputs for equal inputs", () => {
    for (const id of eggIds) {
      expect(rollHatchling(id, ["fantail"])).toEqual(
        rollHatchling(id, ["fantail"]),
      );
    }
  });

  it("gives the hatchling its breed's look, one fear and one love", () => {
    const quirks = new Set<string>();
    for (const id of eggIds) {
      const egg = rollHatchling(id, []);
      expect(egg.look).toBe(egg.breed);
      const [fear, love] = egg.quirks;
      expect(egg.quirks).toHaveLength(2);
      expect(config.quirks.fears).toContain(fear);
      expect(config.quirks.loves).toContain(love);
      quirks.add(fear).add(love);
    }
    expect(quirks.size).toBe(
      config.quirks.fears.length + config.quirks.loves.length,
    );
  });
});
