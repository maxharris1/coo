import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import {
  noteLimit,
  validateBody,
  validateDoodle,
  validateNote,
} from "@/lib/game/notes";
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

const limits = config.game.notes.doodle;

function doodle(strokes: unknown[] = [stroke()]) {
  return { v: 1, w: limits.width, h: limits.height, strokes };
}

function stroke(
  points: unknown[] = [
    [12, 40],
    [14, 41],
  ],
  extra = {},
) {
  return { color: "ink", width: "marker", points, ...extra };
}

describe("validateDoodle", () => {
  it("accepts a stroke in every palette color and width", () => {
    const strokes = (
      ["ink", "stamp", "tomato", "sun", "sky", "mint"] as const
    ).flatMap((color) =>
      (["fine", "marker"] as const).map((width) => ({
        color,
        width,
        points: [[0, 0]],
      })),
    );
    expect(validateDoodle(doodle(strokes))).toEqual({
      ok: true,
      doodle: doodle(strokes),
    });
  });

  it("accepts a lone point as a dot and points on the viewBox edges", () => {
    const edges = doodle([
      stroke([[0, 0]]),
      stroke([[limits.width, limits.height]]),
    ]);
    expect(validateDoodle(edges)).toEqual({ ok: true, doodle: edges });
  });

  it.each<[string, unknown]>([
    ["a hex color", doodle([stroke(undefined, { color: "#ff0000" })])],
    ["an SVG string as the doodle", "<svg><path d='M0 0L1 1'/></svg>"],
    [
      "an SVG string as a color",
      doodle([stroke(undefined, { color: "<svg/>" })]),
    ],
    ["an unknown width", doodle([stroke(undefined, { width: "hairline" })])],
    [
      "an extra top-level key",
      { ...doodle(), raster: "data:image/png;base64,AA" },
    ],
    ["an extra stroke key", doodle([stroke(undefined, { svg: "<path/>" })])],
    ["a NaN point", doodle([stroke([[NaN, 1]])])],
    ["an Infinity point", doodle([stroke([[Infinity, 1]])])],
    ["a fractional point", doodle([stroke([[1.5, 2]])])],
    ["a negative point", doodle([stroke([[-1, 0]])])],
    ["a point past the width", doodle([stroke([[limits.width + 1, 0]])])],
    ["a point past the height", doodle([stroke([[0, limits.height + 1]])])],
    ["a point with three numbers", doodle([stroke([[1, 2, 3]])])],
    ["version 2", { ...doodle(), v: 2 }],
    ["a different viewBox", { ...doodle(), w: limits.width * 2 }],
    ["an empty stroke list", doodle([])],
    ["a stroke with no points", doodle([stroke([])])],
    ["null", null],
    ["an array", [stroke()]],
  ])("rejects %s as invalid", (_, input) => {
    expect(validateDoodle(input)).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects one stroke past the stroke limit", () => {
    const strokes = Array.from({ length: limits.maxStrokes + 1 }, () =>
      stroke([[1, 1]]),
    );
    expect(validateDoodle(doodle(strokes))).toEqual({
      ok: false,
      reason: "too_many_strokes",
    });
    expect(validateDoodle(doodle(strokes.slice(1))).ok).toBe(true);
  });

  it("rejects one point past the point limit", () => {
    const points = Array.from({ length: limits.maxPoints + 1 }, () => [1, 1]);
    expect(validateDoodle(doodle([stroke(points)]))).toEqual({
      ok: false,
      reason: "too_many_points",
    });
    expect(validateDoodle(doodle([stroke(points.slice(1))])).ok).toBe(true);
  });

  it("rejects a payload over the byte cap before checking its shape", () => {
    const big = { ...doodle(), pad: "x".repeat(limits.maxBytes) };
    expect(validateDoodle(big)).toEqual({ ok: false, reason: "too_big" });
  });
});

describe("validateNote", () => {
  it("accepts text only", () => {
    expect(validateNote({ body: "  coo  " }, 140)).toEqual({
      ok: true,
      body: "coo",
      length: 3,
      doodle: null,
    });
  });

  it.each(["", "   "])("accepts a doodle only with body %j", (body) => {
    expect(validateNote({ body, doodle: doodle() }, 140)).toEqual({
      ok: true,
      body: "",
      length: 0,
      doodle: doodle(),
    });
  });

  it("accepts text and a doodle", () => {
    expect(validateNote({ body: "hi", doodle: doodle() }, 140)).toEqual({
      ok: true,
      body: "hi",
      length: 2,
      doodle: doodle(),
    });
  });

  it.each<[string, unknown]>([
    ["no doodle", undefined],
    ["a null doodle", null],
  ])("rejects an empty body with %s", (_, d) => {
    expect(validateNote({ body: "  ", doodle: d }, 140)).toEqual({
      ok: false,
      reason: "empty",
    });
  });

  it.each<[string, unknown]>([
    ["without a doodle", undefined],
    ["with a doodle", doodle()],
  ])("rejects text one past the limit %s", (_, d) => {
    expect(validateNote({ body: "x".repeat(141), doodle: d }, 140)).toEqual({
      ok: false,
      reason: "too_long",
      length: 141,
      limit: 140,
    });
  });

  it("names the doodle failure", () => {
    const bad = doodle([stroke(undefined, { color: "#000" })]);
    expect(validateNote({ body: "hi", doodle: bad }, 140)).toEqual({
      ok: false,
      reason: "doodle",
      doodle: "invalid",
    });
  });
});
