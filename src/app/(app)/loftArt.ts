import { config } from "@/lib/config";

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
  sun: SUN,
  mint: MINT,
  lilac: LILAC,
} = TOKENS;
const WOOD = "#D99A6C";
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
