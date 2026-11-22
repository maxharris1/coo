import { DOODLE_COLORS, type Doodle } from "@/lib/game/notes";
import type { DoodleColor, DoodleWidth, Stroke } from "./draft";

const INK = "var(--coo-ink)";

const PAINT: Record<DoodleColor, { paint: string; outlined: boolean }> = {
  ink: { paint: INK, outlined: false },
  stamp: { paint: "var(--coo-stamp)", outlined: false },
  tomato: { paint: "var(--coo-tomato)", outlined: false },
  sun: { paint: "var(--coo-sun)", outlined: true },
  sky: { paint: "var(--coo-sky)", outlined: true },
  mint: { paint: "var(--coo-mint)", outlined: true },
};

const STROKE_WIDTH: Record<DoodleWidth, number> = { fine: 6, marker: 10 };
const OUTLINE = 4;

const LIST = new Intl.ListFormat("en", { type: "conjunction" });

export function doodleLabel({ strokes }: Doodle): string {
  const used = DOODLE_COLORS.filter((c) => strokes.some((s) => s.color === c));
  return used.every((c) => c === "ink")
    ? "A doodle"
    : `A doodle in ${LIST.format(used)}`;
}

function StrokeShape({ color, width, points }: Stroke) {
  const { paint, outlined } = PAINT[color];
  const size = STROKE_WIDTH[width];
  const layers = outlined
    ? [
        { paint: INK, size: size + OUTLINE },
        { paint, size },
      ]
    : [{ paint, size }];

  if (points.length === 1) {
    const [x, y] = points[0];
    return layers.map(({ paint, size }) => (
      <circle key={size} cx={x} cy={y} r={size / 2} style={{ fill: paint }} />
    ));
  }
  const d = points.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
  return layers.map(({ paint, size }) => (
    <path key={size} d={d} strokeWidth={size} style={{ stroke: paint }} />
  ));
}

export function DoodleStrokes({ strokes }: { strokes: Stroke[] }) {
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      {strokes.map((stroke, i) => (
        <StrokeShape key={i} {...stroke} />
      ))}
    </g>
  );
}

export function DoodleView({
  doodle,
  className,
}: {
  doodle: Doodle;
  className?: string;
}) {
  return (
    <svg
      role="img"
      aria-label={doodleLabel(doodle)}
      className={className}
      viewBox={`0 0 ${doodle.w} ${doodle.h}`}
    >
      <DoodleStrokes strokes={doodle.strokes} />
    </svg>
  );
}
