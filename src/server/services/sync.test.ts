import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import type { BirdRecord } from "@/server/rows";
import { toBirdView } from "./sync";

const HOUR = 3_600_000;
const NOW = Date.UTC(2026, 10, 19, 15, 0, 0);
const { care, notes } = config.game;
const home = { hasBirdbath: false };

const gerald: BirdRecord = {
  id: "00000000-0000-4000-b000-000000000011",
  ownerId: "00000000-0000-4000-a000-000000000001",
  name: "Gerald",
  breed: "city",
  look: "gerald",
  pronoun: "they",
  speedMph: 40,
  focus: 3,
  navigation: 3,
  quirks: ["early riser"],
  miles: 0,
  deliveries: 0,
  detours: 0,
  belly: 80,
  feathers: 80,
  energy: 100,
  careAt: NOW,
  lastFedAt: NOW,
  hungryNotified: false,
  status: "home",
  busyKind: null,
  busyUntil: null,
  gear: [],
  hatchedAt: NOW,
};

describe("toBirdView", () => {
  it("returns the docs/06 Bird shape with care read at nowMs", () => {
    expect(toBirdView(gerald, NOW + 5 * HOUR, home)).toEqual({
      id: gerald.id,
      name: "Gerald",
      breed: "city",
      look: "gerald",
      pronoun: "they",
      speedMph: 40,
      focus: 3,
      navigation: 3,
      quirks: ["early riser"],
      level: 1,
      miles: 0,
      deliveries: 0,
      detours: 0,
      belly: 70,
      feathers: 75,
      energy: 100,
      hungry: false,
      scruffy: false,
      tired: false,
      sulking: false,
      status: "home",
      busyKind: null,
      busyUntil: null,
      gear: [],
      noteLimit: notes.baseLimit,
      canFly: true,
    });
  });

  it("leaves out the internal columns", () => {
    const view = toBirdView(gerald, NOW, home);
    for (const key of [
      "ownerId",
      "careAt",
      "lastFedAt",
      "hungryNotified",
      "hatchedAt",
    ])
      expect(view).not.toHaveProperty(key);
  });

  it("reads care with the owner's birdbath, the level from miles and the limit from gear", () => {
    const pouter = {
      ...gerald,
      breed: "pouter",
      gear: ["tube"],
      miles: 100,
      belly: 40,
    } satisfies BirdRecord;
    expect(
      toBirdView(pouter, NOW + 10 * HOUR, { hasBirdbath: true }),
    ).toMatchObject({
      belly: 20,
      feathers: 75,
      hungry: true,
      level: 3,
      noteLimit: notes.tubeLimit * notes.pouterMultiplier,
    });
  });

  it.each([
    ["flying", "away"],
    ["visiting", "away"],
    ["busy", "busy"],
    ["scheduled", "busy"],
  ] as const)("a %s bird cannot fly: %s", (status, reason) => {
    expect(toBirdView({ ...gerald, status }, NOW, home)).toMatchObject({
      canFly: false,
      cannotFlyReason: reason,
    });
  });

  it("a bird under the minimum energy cannot fly: tired", () => {
    const spent = { ...gerald, energy: care.minEnergyToFly - 5 };
    expect(toBirdView(spent, NOW, home)).toMatchObject({
      tired: true,
      canFly: false,
      cannotFlyReason: "tired",
    });
    expect(toBirdView(spent, NOW + HOUR, home)).toMatchObject({ canFly: true });
  });

  it("an away bird reads away even when it is also out of energy", () => {
    expect(
      toBirdView({ ...gerald, status: "flying", energy: 0 }, NOW, home),
    ).toMatchObject({ canFly: false, cannotFlyReason: "away" });
  });

  it("a sulking bird at home with energy still flies, slower, as docs/04 says", () => {
    const view = toBirdView(
      gerald,
      NOW + care.sulkAfterHoursUnfed * HOUR,
      home,
    );
    expect(view).toMatchObject({ sulking: true, canFly: true });
    expect(view).not.toHaveProperty("cannotFlyReason");
  });
});
