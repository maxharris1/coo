import { describe, expect, it } from "vitest";
import { validateOutfit } from "@/lib/game/gear";
import type { GearId } from "@/lib/game/types";

const closet: GearId[] = ["goggles", "party", "scarf", "band", "backpack"];

describe("validateOutfit", () => {
  it("accepts one item per slot", () => {
    expect(validateOutfit(["goggles", "scarf", "band"], closet, [])).toEqual({
      ok: true,
      items: ["goggles", "scarf", "band"],
    });
  });

  it("accepts an empty outfit", () => {
    expect(validateOutfit([], [], [])).toEqual({ ok: true, items: [] });
  });

  it("rejects two items in one slot", () => {
    expect(validateOutfit(["goggles", "party"], closet, [])).toEqual({
      ok: false,
      problems: [
        { kind: "slot_taken", item: "party", slot: "head", by: "goggles" },
      ],
    });
  });

  it("rejects an item missing from the closet", () => {
    expect(validateOutfit(["bow"], closet, [])).toEqual({
      ok: false,
      problems: [{ kind: "not_owned", item: "bow" }],
    });
  });

  it("rejects an unavailable item even when owned", () => {
    expect(validateOutfit(["backpack"], closet, [])).toEqual({
      ok: false,
      problems: [{ kind: "unavailable", item: "backpack" }],
    });
  });

  it("rejects an item another bird is wearing", () => {
    const others = [{ id: "b2", gear: ["scarf"] }];
    expect(validateOutfit(["scarf"], closet, others)).toEqual({
      ok: false,
      problems: [{ kind: "worn_elsewhere", item: "scarf", birdId: "b2" }],
    });
  });

  it("rejects an unknown id", () => {
    expect(validateOutfit(["nope"], closet, [])).toEqual({
      ok: false,
      problems: [{ kind: "unknown", item: "nope" }],
    });
  });

  it("rejects a repeated id once, on the repeat", () => {
    expect(validateOutfit(["band", "band"], closet, [])).toEqual({
      ok: false,
      problems: [{ kind: "duplicate", item: "band" }],
    });
  });

  it("reports every problem in input order", () => {
    expect(
      validateOutfit(["goggles", "beanie", "nope"], ["goggles"], []),
    ).toEqual({
      ok: false,
      problems: [
        { kind: "slot_taken", item: "beanie", slot: "head", by: "goggles" },
        { kind: "not_owned", item: "beanie" },
        { kind: "unknown", item: "nope" },
      ],
    });
  });

  it("is deterministic", () => {
    const run = () =>
      validateOutfit(["party", "goggles", "bow"], closet, [
        { id: "b2", gear: ["goggles"] },
      ]);
    expect(run()).toEqual(run());
  });
});

describe("validateOutfit with the night-vision goggles", () => {
  const owned: GearId[] = ["goggles", "nightgoggles", "bow"];

  it("takes the head slot, so it cannot be worn with the aviator goggles", () => {
    expect(validateOutfit(["goggles", "nightgoggles"], owned, [])).toEqual({
      ok: false,
      problems: [
        {
          kind: "slot_taken",
          item: "nightgoggles",
          slot: "head",
          by: "goggles",
        },
      ],
    });
  });

  it("goes with a neck item", () => {
    expect(validateOutfit(["nightgoggles", "bow"], owned, [])).toEqual({
      ok: true,
      items: ["nightgoggles", "bow"],
    });
  });

  it("rejects them while another bird wears them", () => {
    const others = [{ id: "b2", gear: ["nightgoggles"] }];
    expect(validateOutfit(["nightgoggles"], owned, others)).toEqual({
      ok: false,
      problems: [
        { kind: "worn_elsewhere", item: "nightgoggles", birdId: "b2" },
      ],
    });
  });

  it("rejects them when they are not in the closet", () => {
    expect(validateOutfit(["nightgoggles"], ["goggles"], [])).toEqual({
      ok: false,
      problems: [{ kind: "not_owned", item: "nightgoggles" }],
    });
  });
});
