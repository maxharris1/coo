import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import { breedIds, gearIds, gearSlots } from "@/lib/game/types";

describe("game types", () => {
  it("keeps BreedId equal to the breed ids in config, in order", () => {
    expect(breedIds).toEqual(config.breeds.breeds.map((b) => b.id));
  });

  it("keeps GearId equal to the gear ids in config, in order", () => {
    expect(gearIds).toEqual(config.gear.items.map((g) => g.id));
  });

  it("keeps GearSlot equal to the slots in config", () => {
    expect(gearSlots).toEqual(config.gear.slots);
    for (const item of config.gear.items) {
      expect(gearSlots).toContain(item.slot);
    }
  });
});
