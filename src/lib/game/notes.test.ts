import { describe, expect, it } from "vitest";
import { noteLimit, validateBody } from "@/lib/game/notes";
import type { Wearer } from "@/lib/game/seeds";

describe("noteLimit", () => {
  it.each<[Wearer, number]>([
    [{ breed: "city", gear: [] }, 140],
    [{ breed: "city", gear: ["tube"] }, 280],
    [{ breed: "pouter", gear: [] }, 280],
    [{ breed: "pouter", gear: ["tube"] }, 560],
  ])("lets %o carry %d characters", (bird, limit) => {
    expect(noteLimit(bird)).toBe(limit);
  });
});

describe("validateBody", () => {
  it("counts an emoji as one character", () => {
    expect(validateBody("🐦", 1)).toEqual({ ok: true, body: "🐦", length: 1 });
  });

  it("trims surrounding whitespace before counting", () => {
    expect(validateBody("  hi  ", 140)).toEqual({
      ok: true,
      body: "hi",
      length: 2,
    });
  });

  it.each(["   \n\t", ""])("rejects %j as empty", (text) => {
    expect(validateBody(text, 140)).toEqual({ ok: false, reason: "empty" });
  });

  it("accepts a body exactly at the limit", () => {
    const body = "🐦".repeat(140);
    expect(validateBody(body, 140)).toEqual({ ok: true, body, length: 140 });
  });

  it("rejects a body one past the limit", () => {
    expect(validateBody("🐦".repeat(141), 140)).toEqual({
      ok: false,
      reason: "too_long",
      length: 141,
      limit: 140,
    });
  });
});

describe("determinism", () => {
  it("gives equal outputs for the same inputs", () => {
    const birds: Wearer[] = [
      { breed: "city", gear: [] },
      { breed: "pouter", gear: ["tube"] },
    ];
    for (const bird of birds) expect(noteLimit(bird)).toEqual(noteLimit(bird));
    for (const text of ["", "  hi  ", "🐦".repeat(141)]) {
      expect(validateBody(text, 140)).toEqual(validateBody(text, 140));
    }
  });
});
