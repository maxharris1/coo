export type Bounds = { x0: number; y0: number; x1: number; y1: number };
type Point = [number, number];

const EMPTY: Bounds = {
  x0: Infinity,
  y0: Infinity,
  x1: -Infinity,
  y1: -Infinity,
};
const ARITY: Record<string, number> = {
  M: 2,
  L: 2,
  H: 1,
  V: 1,
  C: 6,
  S: 4,
  Q: 4,
  T: 2,
  A: 7,
  Z: 0,
};

const numbers = (s: string) =>
  (s.match(/-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/gi) ?? []).map(Number);

function pathPoints(d: string): Point[] {
  const out: Point[] = [];
  let x = 0,
    y = 0,
    startX = 0,
    startY = 0;
  for (const [, cmd, args] of d.matchAll(/([A-Za-z])([^A-Za-z]*)/g)) {
    const op = cmd.toUpperCase();
    if (op === "Z") {
      x = startX;
      y = startY;
      continue;
    }
    const n = numbers(args);
    const step = ARITY[op];
    for (let i = 0; i < n.length; i += step) {
      const a = n.slice(i, i + step);
      const bx = cmd === op ? 0 : x,
        by = cmd === op ? 0 : y;
      if (op === "H") x = bx + a[0];
      else if (op === "V") y = by + a[0];
      else if (op === "A") {
        out.push([x - a[0], y - a[1]], [x + a[0], y + a[1]]);
        x = bx + a[5];
        y = by + a[6];
      } else {
        for (let j = 0; j < step - 2; j += 2)
          out.push([bx + a[j], by + a[j + 1]]);
        x = bx + a[step - 2];
        y = by + a[step - 1];
      }
      out.push([x, y]);
      if (op === "M" && i === 0) {
        startX = x;
        startY = y;
      }
    }
  }
  return out;
}

function shapePoints(tag: string, attr: (k: string) => number): Point[] {
  if (tag === "path") return [];
  if (tag === "rect") {
    const [x, y, w, h] = ["x", "y", "width", "height"].map(attr);
    return [
      [x, y],
      [x + w, y],
      [x, y + h],
      [x + w, y + h],
    ];
  }
  if (tag === "circle" || tag === "ellipse") {
    const cx = attr("cx"),
      cy = attr("cy");
    const rx = tag === "circle" ? attr("r") : attr("rx");
    const ry = tag === "circle" ? attr("r") : attr("ry");
    return [
      [cx - rx, cy - ry],
      [cx + rx, cy - ry],
      [cx - rx, cy + ry],
      [cx + rx, cy + ry],
    ];
  }
  return [];
}

function transform(list: string, [x, y]: Point): Point {
  const ops = [...list.matchAll(/(\w+)\(([^)]*)\)/g)].reverse();
  for (const [, op, args] of ops) {
    const n = numbers(args);
    if (op === "translate") {
      x += n[0];
      y += n[1] ?? 0;
    } else if (op === "scale") {
      x *= n[0];
      y *= n[1] ?? n[0];
    } else if (op === "rotate") {
      const r = (n[0] * Math.PI) / 180,
        cx = n[1] ?? 0,
        cy = n[2] ?? 0,
        dx = x - cx,
        dy = y - cy;
      x = cx + dx * Math.cos(r) - dy * Math.sin(r);
      y = cy + dx * Math.sin(r) + dy * Math.cos(r);
    } else throw new Error(`unsupported transform ${op}`);
  }
  return [x, y];
}

export function inkBounds(svg: string): Bounds {
  const b = { ...EMPTY };
  const groups: string[] = [];
  for (const [, close, tag, attrs] of svg.matchAll(/<(\/?)(\w+)([^>]*)>/g)) {
    if (tag === "g") {
      if (close) groups.pop();
      else groups.push(attrs.match(/ transform="([^"]+)"/)?.[1] ?? "");
      continue;
    }
    if (close || tag === "text") continue;
    const raw = (k: string) => attrs.match(new RegExp(` ${k}="([^"]+)"`))?.[1];
    const attr = (k: string) => Number(raw(k) ?? 0);
    const pts =
      tag === "path" ? pathPoints(raw("d") ?? "") : shapePoints(tag, attr);
    const chain = [...groups, raw("transform") ?? ""];
    const half = attr("stroke-width") / 2;
    for (const p of pts) {
      const [x, y] = chain.reduceRight((q, t) => transform(t, q), p);
      b.x0 = Math.min(b.x0, x - half);
      b.y0 = Math.min(b.y0, y - half);
      b.x1 = Math.max(b.x1, x + half);
      b.y1 = Math.max(b.y1, y + half);
    }
  }
  return b;
}
