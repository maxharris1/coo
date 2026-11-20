import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import { FIRST_BIRD, firstBird, initialFirstBird, PRONOUNS } from "./choices";

const start = initialFirstBird();

describe("first bird choices", () => {
  it("offers the three starter looks from config with their names", () => {
    expect(FIRST_BIRD.looks.map((l) => l.look)).toEqual(
      config.game.start.looks,
    );
    expect(FIRST_BIRD.looks.map((l) => l.name)).toEqual([
      "Gerald",
      "Brenda",
      "Kevin",
    ]);
  });

  it("describes the first bird from config, not from the look", () => {
    expect(FIRST_BIRD.breed).toBe("City pigeon");
    expect(FIRST_BIRD.tags).toEqual(["45 mph", "Loyal", "Bread-motivated"]);
  });

  it("starts on Gerald, named Gerald", () => {
    expect(start).toMatchObject({ index: 0, name: "Gerald" });
  });

  it("offers he, she and they", () => {
    expect(PRONOUNS.map((p) => p.value)).toEqual(["he", "she", "they"]);
  });
});

describe("firstBird reducer", () => {
  it("steps through the looks and wraps both ways", () => {
    const next = firstBird(start, { type: "step", by: 1 });
    expect(next).toMatchObject({ index: 1, name: "Brenda" });
    const wrapped = firstBird(start, { type: "step", by: -1 });
    expect(wrapped).toMatchObject({ index: 2, name: "Kevin" });
    expect(firstBird(wrapped, { type: "step", by: 1 }).index).toBe(0);
  });

  it("keeps a typed name when the look changes", () => {
    const typed = firstBird(start, { type: "rename", name: "Pigeonface" });
    expect(firstBird(typed, { type: "step", by: 1 })).toMatchObject({
      index: 1,
      name: "Pigeonface",
    });
  });

  it("follows the look again once the name is cleared", () => {
    const cleared = firstBird(start, { type: "rename", name: "" });
    expect(firstBird(cleared, { type: "step", by: 1 }).name).toBe("Brenda");
  });

  it("shuffles to a different suggested name and keeps it across looks", () => {
    const names = config.quirks.defaultNames;
    for (const pick of [0, 0.25, 0.5, 0.999]) {
      const shuffled = firstBird(start, { type: "shuffle", pick });
      expect(names).toContain(shuffled.name);
      expect(shuffled.name).not.toBe("Gerald");
      expect(firstBird(shuffled, { type: "step", by: 1 }).name).toBe(
        shuffled.name,
      );
    }
  });

  it("picks a pronoun", () => {
    expect(firstBird(start, { type: "pronoun", pronoun: "she" }).pronoun).toBe(
      "she",
    );
  });
});
