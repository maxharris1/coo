import { createElement } from "react";
import birds from "../../../public/assets/data/birds.json";
import type { Look } from "@/components/Bird";
import { config } from "@/lib/config";
import { loftLayout, type LoftLayout } from "./loftLayout";

export const TOKENS = {
  ink: "#2A2140",
  paper: "#FFF4DC",
  card: "#FFFBF0",
  sky: "#A9DDF7",
  tomato: "#F4623F",
  sun: "#FFC93C",
  mint: "#86D9A0",
  lilac: "#D5D1EA",
  peach: "#F9C5B4",
  sand: "#E9E3D0",
  muted: "#5E5675",
  stamp: "#C23A1C",
  night: "#4A4380",
  nightWater: "#2C2752",
} as const;

export type LoftLook = typeof config.loft.times.day;

const {
  ink: INK,
  card: CARD,
  sky: SKY,
  tomato: TOMATO,
  sun: SUN,
  mint: MINT,
  lilac: LILAC,
  sand: SAND,
  stamp: STAMP,
  night: NIGHT,
} = TOKENS;
const WOOD = "#D99A6C";
const ROSE = "#F59C8E";
const BRICK = "#F08A6B";

const { scene, lights: GARLAND } = config.loft;
const W = scene.width;
const HERO_H = scene.height;
const FLOOR = scene.floorY;
const COPING = scene.copingHeight;
const CX = Math.floor(W / 2);

const ST = `stroke="${INK}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"`;
const ST2 = `stroke="${INK}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"`;

const roundHalfEven = (v: number) => {
  const floor = Math.floor(v);
  const frac = v - floor;
  if (frac !== 0.5) return Math.round(v);
  return floor % 2 === 0 ? floor : floor + 1;
};

const channels = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

export function mix(a: string, b: string, t: number): string {
  const rb = channels(b);
  return (
    "#" +
    channels(a)
      .map((ca, i) =>
        roundHalfEven(ca + (rb[i] - ca) * t)
          .toString(16)
          .toUpperCase()
          .padStart(2, "0"),
      )
      .join("")
  );
}

export function pyFloat(n: number, digits?: number): string {
  if (digits === undefined)
    return Number.isInteger(n) ? n.toFixed(1) : String(n);
  const away = n.toFixed(digits);
  const exact = Math.abs(n).toFixed(digits + 40);
  const point = exact.indexOf(".");
  const tie = /^50*$/.test(exact.slice(point + 1 + digits));
  if (!tie || Number(away.at(-1)) % 2 === 0) return away;
  const down = exact.slice(0, digits ? point + 1 + digits : point);
  return n < 0 ? `-${down}` : down;
}

const WOOD_D = mix(WOOD, INK, 0.2);
const SUN_D = mix(SUN, INK, 0.16);
const TOM_D = mix(TOMATO, INK, 0.18);

type WindowKind = "dark" | "lit" | "curtain" | "plant" | "cat";

function win(
  x: number,
  xIsFloat: boolean,
  y: number,
  w: number,
  h: number,
  wall: string,
  kind: WindowKind,
): string {
  const px = (n: number) => (xIsFloat ? pyFloat(n) : String(n));
  const lit = kind === "lit";
  const pane = mix(wall, INK, 0.42);
  let o = `<rect x="${px(x)}" y="${y}" width="${w}" height="${h}" rx="1.5" fill="${lit ? "§lit§" : pane}" stroke="${INK}" stroke-width="1.6"/>`;
  if (kind === "curtain") {
    o += `<path d="M${pyFloat(x + 0.8)} ${pyFloat(y + 0.8)} h${pyFloat(w - 1.6)} v${pyFloat(h * 0.45, 1)} q-${pyFloat((w - 1.6) / 2, 1)} 3 -${pyFloat(w - 1.6)} 0 Z" fill="${CARD}"/>`;
  } else if (kind === "plant") {
    o += `<circle cx="${pyFloat(x + w * 0.35, 1)}" cy="${y + h - 3}" r="2.6" fill="${MINT}"/><circle cx="${pyFloat(x + w * 0.68, 1)}" cy="${y + h - 4}" r="2.2" fill="${MINT}"/>`;
  } else if (kind === "cat") {
    const cx = x + w / 2;
    const cy = y + h - 0.8;
    o += `<path d="M${pyFloat(cx - 3.5)} ${pyFloat(cy)} v-5 l-.6 -3 l2 1.6 h2.4 l2 -1.6 l-.6 3 v5 Z" fill="${INK}"/>`;
  } else if (!lit) {
    o += `<path d="M${px(x + 2)} ${y + h - 3} L${px(x + w - 3)} ${y + 3}" stroke="${mix(pane, CARD, 0.35)}" stroke-width="1.4" stroke-linecap="round"/>`;
  }
  o += `<rect x="${pyFloat(x - 1.5)}" y="${pyFloat(y + h - 0.5)}" width="${w + 3}" height="2.6" rx="1" fill="${mix(wall, CARD, 0.55)}" stroke="${INK}" stroke-width="1.2"/>`;
  return o;
}

type Neighbour = {
  x: number;
  top: number;
  w: number;
  wall: string;
  wins: (WindowKind | "")[];
  cols?: number;
  win?: [number, number];
  xs?: number[];
};

function neighbour(
  { x, top, w, wall, wins, cols = 2, win: [ww, wh] = [11, 14], xs }: Neighbour,
  moreLit: boolean,
): string {
  let o = `<rect x="${x}" y="${top}" width="${w}" height="${FLOOR - top + 4}" fill="${wall}" ${ST2}/>`;
  const shade = mix(wall, INK, 0.12);
  for (let i = 0; i < Math.floor((FLOOR - top - 30) / 23); i++) {
    o += `<path d="M${x + 5 + ((i * 17) % (w - 16))} ${top + 16 + i * 23} h7 m5 9 h6" stroke="${shade}" stroke-width="1.6" stroke-linecap="round"/>`;
  }
  const gap = (w - cols * ww) / (cols + 1);
  wins.forEach((given, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    const kind = given === "dark" && moreLit && i % 2 === 0 ? "lit" : given;
    if (!kind) return;
    const wx = xs ? xs[c] : Number(pyFloat(x + gap + c * (ww + gap), 1));
    o += win(wx, !xs, top + 14 + r * 22, ww, wh, wall, kind);
  });
  o += `<rect x="${x - 3}" y="${top - 4}" width="${w + 6}" height="7" rx="2.5" fill="${mix(wall, CARD, 0.6)}" ${ST2}/>`;
  return o;
}

function waterTower(x: number, y: number): string {
  return (
    `<g ${ST2}><path d="M${x - 11} ${y} L${x - 9} ${y - 14} M${x + 11} ${y} L${x + 9} ${y - 14} M${x - 10} ${y - 5} L${x + 10} ${y - 11} M${x + 10} ${y - 5} L${x - 10} ${y - 11}" fill="none" stroke-width="1.8"/>` +
    `<rect x="${x - 14}" y="${y - 38}" width="28" height="25" rx="2" fill="${WOOD}"/>` +
    `<path d="M${x - 14} ${y - 30} h28 M${x - 14} ${y - 21} h28" stroke="${WOOD_D}" stroke-width="1.6" fill="none"/>` +
    `<path d="M${x - 7} ${y - 37} v23 M${x} ${y - 37} v23 M${x + 7} ${y - 37} v23" stroke="${mix(WOOD, WOOD_D, 0.5)}" stroke-width="1" fill="none"/>` +
    `<path d="M${x - 17} ${y - 37} L${x} ${y - 51} L${x + 17} ${y - 37} Z" fill="${mix(LILAC, INK, 0.22)}"/><circle cx="${x}" cy="${y - 52}" r="1.8" fill="${INK}" stroke="none"/></g>`
  );
}

function pigeonDot(x: number, y: number, flip = false): string {
  const k = flip ? -1 : 1;
  return `<path d="M${x} ${y} q${-6 * k} 0 ${-7 * k} -4 q${k} -4 ${5 * k} -4 q${k} -3 ${pyFloat(3.5 * k)} -2 l${pyFloat(2.2 * k)} 1 l${-2 * k} 1 q${pyFloat(0.6 * k)} 4 ${pyFloat(-1.7 * k)} 8 Z" fill="${mix(INK, SKY, 0.28)}"/>`;
}

const FAR_TOWERS = [
  [-6, 30, 208],
  [20, 30, 186],
  [54, 36, 204],
  [94, 34, 176],
  [128, 30, 198],
  [160, 44, 184],
  [206, 30, 196],
  [236, 30, 170],
  [262, 28, 152],
  [290, 36, 188],
  [326, 30, 172],
  [356, 40, 196],
];
const MID_TOWERS = [
  [40, 36, 234],
  [72, 30, 252],
  [98, 44, 220],
  [140, 34, 242],
  [170, 44, 206],
  [212, 34, 234],
  [244, 36, 216],
  [278, 30, 240],
  [304, 34, 228],
  [336, 30, 244],
  [372, 24, 232],
];

export function skyline(look: LoftLook): { back: string; near: string } {
  const far = look.far;
  const mid = look.mid;
  const lowBand = look.sky[look.sky.length - 1].color;
  const windowFill = mix(mid, lowBand, 0.5);
  let o = FAR_TOWERS.map(
    ([x, w, t]) =>
      `<rect x="${x}" y="${t}" width="${w}" height="${FLOOR - t}" fill="${far}"/>`,
  ).join("");
  o += `<path d="M268 152 h16 l-3 -9 h-10 Z M273 143 h6 l-2 -8 h-2 Z" fill="${far}"/><path d="M276 136 V124 M111 176 V164 M341 172 V160" stroke="${far}" stroke-width="2" stroke-linecap="round" fill="none"/>`;
  o += `<path d="M94 190 h34 M94 204 h34 M236 184 h30 M236 198 h30 M160 198 h44 M326 186 h30" stroke="${mix(far, lowBand, 0.5)}" stroke-width="2" fill="none"/>`;
  o += `<rect x="180" y="192" width="24" height="16" fill="${mid}"/><path d="M192 192 V180" stroke="${mid}" stroke-width="2.4" stroke-linecap="round"/>`;
  o += `<g fill="${mid}"><path d="M250 216 L252 205 H266 L268 216 Z"/><rect x="250" y="192" width="18" height="14" rx="2"/><path d="M248 193 L259 185 L270 193 Z"/></g>`;
  MID_TOWERS.forEach(([x, w, t], n) => {
    o += `<rect x="${x}" y="${t}" width="${w}" height="${FLOOR - t}" fill="${mid}"/><rect x="${x}" y="${t}" width="${w}" height="3" fill="${mix(mid, INK, 0.12)}"/>`;
    const cols = Math.max(2, Math.floor((w - 8) / 9));
    const gap = (w - cols * 5) / (cols + 1);
    for (let r = 0; r < Math.floor((FLOOR - t - 16) / 12); r++) {
      for (let c = 0; c < cols; c++) {
        const k = (n * 7 + r * 3 + c * 5) % 11;
        const yy = t + 9 + r * 12;
        if (k === 0 || k === 7) continue;
        const lit = look.litWindowKeys.includes(k) && yy < FLOOR - 70;
        o += `<rect x="${pyFloat(x + gap + c * (5 + gap), 1)}" y="${yy}" width="5" height="7" rx="1" fill="${lit ? "§lit§" : windowFill}"/>`;
      }
    }
  });
  const back = o;

  const moreLit = look.moreNeighbourWindowsLit;
  const brick = mix(BRICK, SKY, 0.34);
  const slate = mix(LILAC, INK, 0.13);
  let near = neighbour(
    {
      x: 40,
      top: 288,
      w: 60,
      wall: slate,
      wins: ["dark", "lit"],
      win: [10, 12],
      xs: [51, 64],
    },
    moreLit,
  );
  near += `<g ${ST2}><rect x="54" y="270" width="18" height="14" fill="${mix(slate, CARD, 0.35)}"/><rect x="59" y="275" width="7" height="9" fill="${mix(slate, INK, 0.4)}" stroke-width="1.4"/></g>`;
  near += pigeonDot(68, 270);
  near += neighbour(
    {
      x: -8,
      top: 198,
      w: 56,
      wall: brick,
      wins: [
        "curtain",
        "dark",
        "lit",
        "plant",
        "dark",
        "cat",
        "dark",
        "curtain",
      ],
      win: [13, 15],
    },
    moreLit,
  );
  near += pigeonDot(12, 194, true);
  near += neighbour(
    {
      x: 284,
      top: 274,
      w: 56,
      wall: slate,
      wins: ["curtain"],
      cols: 1,
      win: [10, 12],
      xs: [323],
    },
    moreLit,
  );
  near += `<g ${ST2}><path d="M300 270 V262" fill="none"/><circle cx="296" cy="259" r="6.5" fill="${MINT}"/><circle cx="304" cy="256" r="7.5" fill="${MINT}"/><rect x="293" y="264" width="14" height="6" rx="1.5" fill="${WOOD}"/><rect x="320" y="262" width="13" height="8" rx="1.5" fill="${mix(slate, INK, 0.18)}"/></g>`;
  near += neighbour(
    {
      x: 338,
      top: 250,
      w: 60,
      wall: mix(BRICK, SKY, 0.42),
      wins: ["dark", "lit", "plant", "dark"],
      win: [13, 15],
    },
    moreLit,
  );
  near += waterTower(367, 246);
  const litWindow = (s: string) => s.replaceAll("§lit§", SUN);
  return { back: litWindow(back), near: litWindow(near) };
}

export function cloud(
  x: number,
  y: number,
  w: number,
  delay = 0,
  dur = 26,
  fill: string = CARD,
): string {
  const s = w / 74;
  return (
    `<g transform="translate(${x} ${y}) scale(${pyFloat(s, 3)})"><g style="animation: coo-drift ${dur}s ease-in-out ${delay}s infinite alternate">` +
    `<path d="M10 28 q-8 -2 -6 -10 q0 -10 12 -10 q6 -8 18 -5 q12 -3 15 8 q12 0 12 9 q0 8 -9 8 z" fill="${fill}" stroke="${INK}" stroke-width="${pyFloat(2.5 / s, 2)}" stroke-linejoin="round"/></g></g>`
  );
}

export function sky(look: LoftLook, clouds = true): string {
  let o = look.sky
    .map(
      ({ fromY, color }) =>
        `<rect x="-4" y="${fromY}" width="${W + 8}" height="${HERO_H + 300}" fill="${color}"/>`,
    )
    .join("");
  if (clouds) {
    o += cloud(288, 80, 60, 0, 30, look.cloud);
    o += cloud(338, 122, 34, 4, 24, look.cloud);
  }
  return o;
}

export function lights(hide?: { x0: number; x1: number; y: number }): string {
  const p0 = [-6, GARLAND.y];
  const p1 = [CX, GARLAND.y + 2 * GARLAND.sag];
  const p2 = [W + 6, GARLAND.y];
  let o = `<path d="M${p0[0]} ${p0[1]} Q${p1[0]} ${p1[1]} ${p2[0]} ${p2[1]}" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`;
  const n = GARLAND.bulbs;
  for (let i = 0; i < n; i++) {
    const t = GARLAND.fromT + ((GARLAND.toT - GARLAND.fromT) * (i + 0.5)) / n;
    const at = (axis: 0 | 1) =>
      (1 - t) ** 2 * p0[axis] + 2 * (1 - t) * t * p1[axis] + t * t * p2[axis];
    const x = at(0);
    const y = at(1);
    if (hide && hide.x0 < x && x < hide.x1 && y > hide.y) continue;
    const c = mix(
      GARLAND.colors[i % GARLAND.colors.length],
      CARD,
      GARLAND.unlitMixToCard,
    );
    o +=
      `<g transform="translate(${pyFloat(x, 1)} ${pyFloat(y, 1)})">` +
      `<rect x="-2.5" y="0" width="5" height="4" rx="1" fill="${INK}"/><path d="M0 3.5 C5 5 5.5 11 0 14 C-5.5 11 -5 5 0 3.5 Z" fill="${c}" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/></g>`;
  }
  return o;
}

export function deck(brick: string = TOKENS.peach): string {
  const y0 = FLOOR + COPING;
  const y1 = HERO_H;
  const mid = pyFloat((y0 + y1) / 2 + 1);
  const line = `stroke="${INK}" stroke-width="1.6" opacity=".55"`;
  let o = `<rect x="-4" y="${y0}" width="${W + 8}" height="${y1 - y0}" fill="${brick}"/>`;
  o += `<path d="M-4 ${mid} H${W + 4}" ${line}/>`;
  for (let x = 30; x < W; x += 52)
    o += `<path d="M${x} ${y0} V${mid}" ${line}/>`;
  for (let x = 4; x < W; x += 52)
    o += `<path d="M${x} ${mid} V${y1}" ${line}/>`;
  o += `<rect x="-4" y="${FLOOR}" width="${W + 8}" height="${COPING}" fill="${CARD}" ${ST}/>`;
  o += `<path d="M-4 ${pyFloat(y1 - 1.25)} H${W + 4}" stroke="${INK}" stroke-width="2.5"/>`;
  return o;
}

export type LoftRoom =
  "home" | "empty" | "egg" | "ready" | "roommate" | `away:${Look}`;
export type LoftItem = "birdbath" | "cart" | "planters" | "vane";
export type LoftArtProps = {
  perches: number;
  rooms: readonly LoftRoom[];
  items: readonly LoftItem[];
  clouds?: boolean;
};

type BayState = LoftRoom | "toLet";

const { rooms: ROOM, slots: SLOTS } = config.loft;
const BAY_W = ROOM.width;
const BAY_H = ROOM.height;
const f = (n: number) => pyFloat(n);
const f1 = (n: number) => pyFloat(n, 1);

function toLetBay(x: number, y: number): string {
  const sx = x + 37;
  const sy = y + 36;
  return (
    `<rect x="${f(x)}" y="${y}" width="${BAY_W}" height="${BAY_H}" fill="${SAND}" ${ST}/>` +
    `<rect x="${f(x + 7)}" y="${y + 7}" width="${BAY_W - 14}" height="${BAY_H - 14}" rx="6" fill="none" stroke="${INK}" stroke-width="1.8" stroke-dasharray="3 5" stroke-linecap="round" opacity=".55"/>` +
    `<g transform="rotate(-4 ${f(sx)} ${sy})"><path d="M${f(sx - 14)} ${sy} L${f(sx)} ${sy - 14} L${f(sx + 14)} ${sy}" fill="none" stroke="${INK}" stroke-width="1.6"/>` +
    `<circle cx="${f(sx)}" cy="${sy - 14}" r="2" fill="${INK}"/><rect x="${f(sx - 22)}" y="${sy}" width="44" height="19" rx="4" fill="${CARD}" ${ST2}/>` +
    `<text x="${f(sx)}" y="${f(sy + 13.4)}" text-anchor="middle" font-family="Nunito, sans-serif" font-weight="900" font-size="9.5" letter-spacing=".6" fill="${STAMP}">TO LET</text></g>`
  );
}

function feather(x: number, y: number, look: Look): string {
  const fx = x + 36;
  const fy = y + 64;
  return (
    `<g transform="rotate(-14 ${f(fx)} ${fy})"><path d="M${f(fx - 15)} ${fy} q8 -9 22 -6 q6 1 9 5 q-12 7 -24 4 Z" fill="${birds[look].wing}" ${ST2}/>` +
    `<path d="M${f(fx - 15)} ${fy} q14 -2 28 -2" fill="none" stroke="${INK}" stroke-width="1.5" stroke-linecap="round"/></g>`
  );
}

function suitcase(x: number, y: number): string {
  const cx = x + 40;
  const by = y + 68;
  return (
    `<g ${ST2}><path d="M${f(cx - 5)} ${by - 19} v-4 q0 -3 3 -3 h4 q3 0 3 3 v4" fill="none"/><rect x="${f(cx - 13)}" y="${by - 19}" width="26" height="19" rx="4" fill="${TOMATO}"/>` +
    `<path d="M${f(cx - 6)} ${by - 19} v19 M${f(cx + 6)} ${by - 19} v19" stroke="${CARD}" stroke-width="3"/><path d="M${f(cx - 6)} ${by - 19} v19 M${f(cx + 6)} ${by - 19} v19" fill="none" stroke-width="0"/>` +
    `<rect x="${f(cx - 13)}" y="${by - 19}" width="26" height="19" rx="4" fill="none"/>` +
    `<path d="M${f(cx + 13)} ${by - 12} l7 3" fill="none" stroke-width="1.5"/><rect x="${f(cx + 18)}" y="${by - 11}" width="9" height="7" rx="1.5" fill="${SUN}" stroke-width="1.5" transform="rotate(18 ${f(cx + 22)} ${by - 8})"/></g>`
  );
}

function nest(x: number, y: number, ready: boolean): string {
  const ex = x + 40;
  const ey = y + 68;
  let egg = `<path d="M0 -24 C7 -24 11 -11 11 -5 a11 11 0 0 1 -22 0 C-11 -11 -7 -24 0 -24 Z" fill="${CARD}" ${ST2}/><circle cx="-4" cy="-10" r="1.6" fill="${LILAC}"/><circle cx="4" cy="-4" r="2" fill="${LILAC}"/>`;
  let o = `<path d="M${f(ex - 15)} ${ey - 4} q15 9 30 0 l-2 4 h-26 Z" fill="${WOOD_D}" ${ST2}/>`;
  if (ready) {
    egg += `<path d="M-9 -9 l4 3 l4 -4 l4 4 l5 -3" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>`;
    egg = `<g style="transform-box: fill-box; transform-origin: 50% 100%; animation: coo-wobble .9s ease-in-out infinite">${egg}</g>`;
    o += `<path d="M${f(ex + 14)} ${ey - 24} l5 -4 M${f(ex + 17)} ${ey - 15} l6 0 M${f(ex - 14)} ${ey - 24} l-5 -4" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>`;
  }
  o += `<g transform="translate(${f(ex)} ${ey - 1})">${egg}</g>`;
  o += `<path d="M${f(ex - 16)} ${ey - 3} q16 10 32 0" fill="none" ${ST2}/>`;
  return o;
}

function bay(x: number, y: number, state: BayState): string {
  if (state === "toLet") return toLetBay(x, y);
  let o =
    `<circle cx="${f(x + 17)}" cy="${y + 19}" r="15" fill="§halo§" opacity="§haloa§"/><circle cx="${f(x + 17)}" cy="${y + 19}" r="10" fill="§hole§" ${ST}/>` +
    `<path d="M${f(x + 10.5)} ${y + 16} a7 7 0 0 1 6 -4.5" fill="none" stroke="§holehi§" stroke-width="1.8" stroke-linecap="round"/>` +
    `<path d="M${f(x + 14)} ${y + 78} v-5 h7 Z M${f(x + 60)} ${y + 78} v-5 h-7 Z" fill="${WOOD_D}" ${ST2}/>` +
    `<rect x="${f(x + 7)}" y="${y + 68}" width="${BAY_W - 14}" height="7" rx="3" fill="${WOOD}" ${ST}/>`;
  if (state.startsWith("away:"))
    o += feather(x, y, state.slice("away:".length) as Look);
  else if (state === "roommate") o += suitcase(x, y);
  else if (state === "egg" || state === "ready")
    o += nest(x, y, state === "ready");
  return o;
}

function floorsOf(rooms: LoftLayout["rooms"]) {
  const floors: { x: number; y: number; n: number }[] = [];
  for (const { x, y } of rooms) {
    const top = floors.at(-1);
    if (top?.y === y) top.n++;
    else floors.push({ x, y, n: 1 });
  }
  return floors;
}

export function vane(x: number, y: number): string {
  return (
    `<g ${ST2}><path d="M${x} ${y + 2} V${y - 13}" fill="none" stroke-width="2.5"/><circle cx="${x}" cy="${y - 1}" r="3.2" fill="${SUN}"/>` +
    `<g style="transform-box: fill-box; transform-origin: 50% 100%; animation: coo-sway 7s ease-in-out infinite alternate">` +
    `<path d="M${x - 17} ${y - 14} H${x + 12}" fill="none"/><path d="M${x + 11} ${y - 19} L${x + 20} ${y - 14} L${x + 11} ${y - 9} Z" fill="${SUN}"/>` +
    `<path d="M${x - 17} ${y - 19} l-5 5 l5 5 Z" fill="${SUN}"/>` +
    `<path d="M${x - 8} ${y - 17} q0 -9 8 -9 q4 -5 8 -1 l4 1 l-4 2 q0 7 -8 7 Z" fill="${CARD}"/><circle cx="${f(x + 5.5)}" cy="${y - 26}" r=".9" fill="${INK}" stroke="none"/></g></g>`
  );
}

export function house(
  layout: LoftLayout,
  rooms: readonly LoftRoom[],
  items: readonly LoftItem[],
): string {
  const floors = floorsOf(layout.rooms);
  let o = "";
  for (const { x, y, n } of floors) {
    o += `<rect x="${f(x)}" y="${y}" width="${n * BAY_W}" height="${BAY_H}" fill="${SUN}" ${ST}/>`;
    for (const k of [20, 40, 60])
      o += `<path d="M${f(x + 2)} ${y + k} H${f(x + n * BAY_W - 2)}" stroke="${SUN_D}" stroke-width="1.5"/>`;
    for (let c = 1; c < n; c++)
      o += `<path d="M${f(x + c * BAY_W)} ${y} V${y + BAY_H}" stroke="${INK}" stroke-width="2"/>`;
  }
  for (const below of floors.slice(0, -1))
    o += `<rect x="${f(below.x - 4)}" y="${below.y - 3}" width="${below.n * BAY_W + 8}" height="7" rx="3" fill="${CARD}" ${ST}/>`;
  layout.rooms.forEach(({ x, y, toLet }, i) => {
    o += bay(x, y, toLet ? "toLet" : (rooms[i] ?? "empty"));
  });

  const { x0, x1, eave: ey, peak: py } = layout.roof;
  o += `<path d="M${f(x0 + 5)} ${ey - 3} L${CX} ${py} L${f(x1 - 5)} ${ey - 3} Z" fill="${TOMATO}" ${ST}/>`;
  const k = (ey - 3 - py) / (CX - x0 - 5);
  for (const d of [16, 32]) {
    if (CX - x0 - 5 - d * 1.9 > 30)
      o += `<path d="M${f1(x0 + 5 + d * 1.9)} ${ey - 3} L${CX} ${f1(py + d)} L${f1(x1 - 5 - d * 1.9)} ${ey - 3}" fill="none" stroke="${TOM_D}" stroke-width="1.6" stroke-linejoin="round"/>`;
  }
  o += `<rect x="${f(x0)}" y="${ey - 5}" width="${f(x1 - x0)}" height="9" rx="4" fill="${TOM_D}" ${ST}/>`;
  o +=
    `<rect x="${CX - 29}" y="${ey - 24}" width="58" height="15" rx="4" fill="${CARD}" ${ST2}/>` +
    `<text x="${CX}" y="${ey - 13}" text-anchor="middle" font-family="Nunito, sans-serif" font-weight="900" font-size="9.5" letter-spacing=".8" fill="${INK}">LOFT 4B</text>`;
  const px = CX + (x1 - CX) * 0.52;
  const pyy = py + (px - CX) * k;
  o += `<rect x="${f(px - 5)}" y="${f1(pyy - 20)}" width="10" height="${f1(24)}" fill="${LILAC}" ${ST2}/><rect x="${f(px - 7.5)}" y="${f1(pyy - 24)}" width="15" height="6" rx="2" fill="${mix(LILAC, INK, 0.2)}" ${ST2}/>`;
  const puffs = [
    [1, -34, 4.5],
    [6, -44, 6],
    [2, -55, 4],
  ];
  puffs.forEach(([dx, dy, r], j) => {
    o +=
      `<circle cx="${f1(px + dx)}" cy="${f1(pyy + dy)}" r="${r}" fill="${CARD}" stroke="${INK}" stroke-width="1.6" ` +
      `style="transform-box: fill-box; transform-origin: 50% 50%; animation: loft-smoke 5s ease-out ${f1(j * 1.6)}s infinite"/>`;
  });
  if (items.includes("vane")) o += vane(CX, py);
  return o;
}

export function planter(x: number): string {
  const cols = [TOMATO, CARD, ROSE, SUN, CARD];
  let o = `<g ${ST2}><rect x="${x - 28}" y="${FLOOR + 10}" width="56" height="13" rx="3" fill="${WOOD}"/><path d="M${x - 28} ${FLOOR + 15} H${x + 28}" fill="none" stroke="${WOOD_D}" stroke-width="1.5"/>`;
  for (let i = 0; i < 5; i++)
    o += `<circle cx="${x - 22 + i * 11}" cy="${FLOOR + 8}" r="5.2" fill="${MINT}"/>`;
  cols.forEach((c, i) => {
    o += `<circle cx="${f(x - 21 + i * 10.5)}" cy="${f(FLOOR + 4.5 + (i % 2))}" r="3.9" fill="${c}" stroke-width="1.5"/>`;
  });
  return o + "</g>";
}

export function birdbath(x: number = SLOTS.birdbath.centerX): string {
  const y = FLOOR;
  return (
    `<g ${ST}><path d="M${x - 13} ${y} q0 -6 5 -7 h16 q5 1 5 7 Z" fill="${LILAC}"/><path d="M${x - 5} ${y - 7} V${y - 30} H${x + 5} V${y - 7} Z" fill="${CARD}"/>` +
    `<path d="M${x - 26} ${y - 42} H${x + 26} q-2 14 -26 14 q-24 0 -26 -14 Z" fill="${CARD}"/>` +
    `<ellipse cx="${x}" cy="${y - 42}" rx="26" ry="5.5" fill="${SKY}"/>` +
    `<path d="M${x - 12} ${y - 42} q4 -2 8 0 M${x + 4} ${y - 43} q4 -2 8 0" fill="none" stroke-width="1.6"/></g>` +
    `<path d="M${x - 19} ${y - 36} q2 6 10 8" fill="none" stroke="${LILAC}" stroke-width="2.4" stroke-linecap="round"/>` +
    `<g fill="${CARD}" stroke="${INK}" stroke-width="1.4"><circle cx="${x + 15}" cy="${y - 54}" r="2.2" style="animation: coo-twinkle 2.6s ease-in-out infinite"/><circle cx="${x + 21}" cy="${y - 61}" r="1.5" style="animation: coo-twinkle 2.6s ease-in-out .9s infinite"/></g>`
  );
}

export function cart(x: number = SLOTS.cart.centerX): string {
  const y = FLOOR;
  let o = `<g ${ST}>`;
  o += `<path d="M${x - 23} ${y - 28} V${y - 52} M${x + 23} ${y - 28} V${y - 52}" fill="none"/>`;
  o += `<path d="M${x - 15} ${y - 30} q15 -17 30 0 Z" fill="${SUN}"/>`;
  o += `<rect x="${x - 25}" y="${y - 30}" width="50" height="19" rx="4" fill="${CARD}"/>`;
  o += `<rect x="${x - 28}" y="${y - 33}" width="56" height="7" rx="3" fill="${WOOD}"/>`;
  o += `<path d="M${x} ${y - 24} c3.4 2.6 4.6 5.6 0 10 c-4.6 -4.4 -3.4 -7.4 0 -10 Z" fill="${SUN}" stroke-width="1.8"/>`;
  o += `<circle cx="${x - 14}" cy="${y - 8}" r="8" fill="${CARD}"/><circle cx="${x + 14}" cy="${y - 8}" r="8" fill="${CARD}"/>`;
  o += `<circle cx="${x - 14}" cy="${y - 8}" r="2.2" fill="${INK}"/><circle cx="${x + 14}" cy="${y - 8}" r="2.2" fill="${INK}"/>`;
  const ax0 = x - 27.5;
  for (let i = 0; i < 5; i++)
    o += `<path d="M${f(ax0 + i * 11)} ${y - 64} h11 v9 a5.5 5.5 0 0 1 -11 0 Z" fill="${i % 2 === 0 ? TOMATO : CARD}"/>`;
  o += `<rect x="${f(ax0 - 1)}" y="${y - 68}" width="57" height="6" rx="3" fill="${TOM_D}"/>`;
  return o + "</g>";
}

export function loftArtMarkup({
  perches,
  rooms,
  items,
  clouds = true,
}: LoftArtProps): string {
  const look = config.loft.times.day;
  const layout = loftLayout(perches);
  const { roof } = layout;
  const { back, near } = skyline(look);
  let o = sky(look, clouds) + back + near;
  o += lights(
    layout.floors > 1
      ? { x0: roof.x0 - 4, x1: roof.x1 + 4, y: roof.peak - 22 }
      : undefined,
  );
  o += house(layout, rooms, items);
  if (items.includes("birdbath")) o += birdbath();
  if (items.includes("cart")) o += cart();
  o += deck();
  if (items.includes("planters"))
    o += SLOTS.flowerBoxes.centerX.map(planter).join("");
  const warm = mix(SUN, CARD, 0.25);
  const glow = look.doorwaysGlow;
  return o
    .replaceAll("§hole§", glow ? warm : NIGHT)
    .replaceAll(
      "§holehi§",
      glow ? mix(warm, CARD, 0.6) : mix(NIGHT, CARD, 0.35),
    )
    .replaceAll("§halo§", warm)
    .replaceAll("§haloa§", glow ? ".4" : "0");
}

export function LoftArt({
  label = "Your rooftop loft",
  ...props
}: LoftArtProps & { label?: string }) {
  return createElement("svg", {
    xmlns: "http://www.w3.org/2000/svg",
    width: W,
    height: HERO_H,
    viewBox: `0 0 ${W} ${HERO_H}`,
    role: "img",
    "aria-label": label,
    dangerouslySetInnerHTML: { __html: loftArtMarkup(props) },
  });
}
