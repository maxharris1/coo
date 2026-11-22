import { config } from "@/lib/config";
import { DOODLE_COLORS, DOODLE_WIDTHS, type Doodle } from "@/lib/game/notes";

export type Point = [number, number];
export type Stroke = Doodle["strokes"][number];
export type DoodleColor = (typeof DOODLE_COLORS)[number];
export type DoodleWidth = (typeof DOODLE_WIDTHS)[number];

export type Draft = {
  strokes: Doodle["strokes"];
  active: Stroke | null;
  color: DoodleColor;
  width: DoodleWidth;
};

export type DraftAction =
  | { type: "down"; point: Point }
  | { type: "move"; point: Point }
  | { type: "up" }
  | { type: "cancel" }
  | { type: "undo" }
  | { type: "clear" }
  | { type: "color"; color: DoodleColor }
  | { type: "width"; width: DoodleWidth };

const limits = config.game.notes.doodle;
const MIN_GAP = 2;

export const EMPTY_DRAFT: Draft = {
  strokes: [],
  active: null,
  color: "ink",
  width: "marker",
};

const clamp = (n: number, max: number) => Math.min(max, Math.max(0, n));

const onCanvas = ([x, y]: Point): Point => [
  clamp(Math.round(x), limits.width),
  clamp(Math.round(y), limits.height),
];

const pointCount = ({ strokes, active }: Draft) =>
  strokes.reduce((n, s) => n + s.points.length, active?.points.length ?? 0);

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedOf(points: Point[]): number {
  let h = 0;
  for (const [x, y] of points) {
    h = (Math.imul(h, 31) + x) | 0;
    h = (Math.imul(h, 31) + y) | 0;
  }
  return h;
}

export function wobble(points: Point[]): Point[] {
  if (points.length < 2) return points;
  const random = mulberry32(seedOf(points));
  const nudge = () => Math.floor(random() * 3) - 1;
  return points.map(([x, y]) => [
    clamp(x + nudge(), limits.width),
    clamp(y + nudge(), limits.height),
  ]);
}

export function draftReducer(draft: Draft, action: DraftAction): Draft {
  switch (action.type) {
    case "down": {
      if (
        draft.strokes.length >= limits.maxStrokes ||
        pointCount(draft) >= limits.maxPoints
      ) {
        return draft;
      }
      const { color, width } = draft;
      const active = { color, width, points: [onCanvas(action.point)] };
      return { ...draft, active };
    }
    case "move": {
      const { active } = draft;
      if (!active || pointCount(draft) >= limits.maxPoints) return draft;
      const point = onCanvas(action.point);
      const [lx, ly] = active.points[active.points.length - 1];
      if (Math.hypot(point[0] - lx, point[1] - ly) < MIN_GAP) return draft;
      return {
        ...draft,
        active: { ...active, points: [...active.points, point] },
      };
    }
    case "up": {
      const { active } = draft;
      if (!active) return draft;
      const stroke = { ...active, points: wobble(active.points) };
      return { ...draft, strokes: [...draft.strokes, stroke], active: null };
    }
    case "cancel":
      return draft.active ? { ...draft, active: null } : draft;
    case "undo":
      return draft.strokes.length
        ? { ...draft, strokes: draft.strokes.slice(0, -1) }
        : draft;
    case "clear":
      return { ...draft, strokes: [], active: null };
    case "color":
      return { ...draft, color: action.color };
    case "width":
      return { ...draft, width: action.width };
  }
}

export function toDoodle({ strokes }: Draft): Doodle | null {
  if (!strokes.length) return null;
  return { v: 1, w: limits.width, h: limits.height, strokes };
}
