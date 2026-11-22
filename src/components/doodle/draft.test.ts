import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import { validateDoodle } from "@/lib/game/notes";
import {
  type Draft,
  type DraftAction,
  EMPTY_DRAFT,
  draftReducer,
  toDoodle,
  wobble,
} from "./draft";

const limits = config.game.notes.doodle;

const run = (actions: DraftAction[], from: Draft = EMPTY_DRAFT) =>
  actions.reduce(draftReducer, from);

const swipe = (
  from: [number, number],
  to: [number, number],
  steps = 10,
): DraftAction[] => [
  { type: "down", point: from },
  ...Array.from({ length: steps }, (_, i) => ({
    type: "move" as const,
    point: [
      from[0] + ((to[0] - from[0]) * (i + 1)) / steps,
      from[1] + ((to[1] - from[1]) * (i + 1)) / steps,
    ] as [number, number],
  })),
  { type: "up" },
];

describe("doodle draft", () => {
  it("starts empty, in ink, with nothing to save", () => {
    expect(EMPTY_DRAFT.color).toBe("ink");
    expect(toDoodle(EMPTY_DRAFT)).toBeNull();
  });

  it("drawing produces a doodle validateDoodle accepts", () => {
    const draft = run([
      ...swipe([20, 20], [200, 150]),
      { type: "color", color: "sky" },
      { type: "width", width: "fine" },
      ...swipe([290, 10], [10, 190]),
    ]);
    const doodle = toDoodle(draft)!;
    expect(validateDoodle(doodle)).toEqual({ ok: true, doodle });
    expect(doodle.strokes.map((s) => [s.color, s.width])).toEqual([
      ["ink", "marker"],
      ["sky", "fine"],
    ]);
  });

  it("a tap is a single-point stroke", () => {
    const doodle = toDoodle(
      run([{ type: "down", point: [50, 60] }, { type: "up" }]),
    )!;
    expect(doodle.strokes[0].points).toEqual([[50, 60]]);
    expect(validateDoodle(doodle).ok).toBe(true);
  });

  it("undo drops the last stroke and clear drops them all", () => {
    const two = run([
      ...swipe([10, 10], [100, 10]),
      ...swipe([10, 50], [100, 50]),
    ]);
    const undone = run([{ type: "undo" }], two);
    expect(undone.strokes).toEqual([two.strokes[0]]);
    expect(validateDoodle(toDoodle(undone)).ok).toBe(true);
    expect(toDoodle(run([{ type: "undo" }], undone))).toBeNull();
    expect(toDoodle(run([{ type: "clear" }], two))).toBeNull();
    const redrawn = run([{ type: "clear" }, ...swipe([5, 5], [80, 80])], two);
    expect(validateDoodle(toDoodle(redrawn)).ok).toBe(true);
  });

  it("thins points closer than 2 units to the last kept point", () => {
    const draft = run([
      { type: "down", point: [100, 100] },
      { type: "move", point: [101, 100] },
      { type: "move", point: [101, 101] },
      { type: "move", point: [102, 100] },
      { type: "move", point: [110, 100] },
    ]);
    expect(draft.active!.points).toEqual([
      [100, 100],
      [102, 100],
      [110, 100],
    ]);
  });

  it("rounds and clamps points onto the canvas", () => {
    const draft = run([
      { type: "down", point: [-5.4, 300.2] },
      { type: "move", point: [150.6, 99.5] },
      { type: "up" },
    ]);
    for (const [x, y] of draft.strokes[0].points) {
      expect(Number.isInteger(x) && Number.isInteger(y)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(limits.width);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(limits.height);
    }
  });

  it("bakes a slight deterministic wobble into the stroke on lift", () => {
    const drawing = run(swipe([0, 0], [300, 200], 60).slice(0, -1));
    const raw = drawing.active!.points;
    const draft = run([{ type: "up" }], drawing);
    const stored = draft.strokes[0].points;
    expect(stored).toHaveLength(raw.length);
    expect(stored).not.toEqual(raw);
    stored.forEach(([x, y], i) => {
      expect(Math.abs(x - raw[i][0])).toBeLessThanOrEqual(1);
      expect(Math.abs(y - raw[i][1])).toBeLessThanOrEqual(1);
    });
    expect(wobble(raw)).toEqual(stored);
    expect(wobble(raw)).toEqual(wobble(raw));
    expect(validateDoodle(toDoodle(draft)).ok).toBe(true);
  });

  it("cancel drops the stroke in progress", () => {
    const draft = run([
      ...swipe([10, 10], [90, 90]),
      { type: "down", point: [5, 5] },
      { type: "move", point: [50, 50] },
      { type: "cancel" },
    ]);
    expect(draft.active).toBeNull();
    expect(draft.strokes).toHaveLength(1);
  });

  it("ignores moves and lifts with no stroke in progress", () => {
    expect(run([{ type: "move", point: [9, 9] }, { type: "up" }])).toEqual(
      EMPTY_DRAFT,
    );
  });

  it("stops at the stroke and point limits so the doodle stays valid", () => {
    let draft = EMPTY_DRAFT;
    for (let i = 0; i < limits.maxStrokes + 5; i++) {
      draft = run(
        [
          { type: "color", color: "tomato" },
          ...swipe([0, i % 200], [300, 200 - (i % 200)], 80),
        ],
        draft,
      );
    }
    expect(draft.strokes.length).toBeLessThanOrEqual(limits.maxStrokes);
    const points = draft.strokes.reduce((n, s) => n + s.points.length, 0);
    expect(points).toBeLessThanOrEqual(limits.maxPoints);
    expect(validateDoodle(toDoodle(draft))).toMatchObject({ ok: true });
  });
});
