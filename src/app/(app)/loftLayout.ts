import { perchedHeight } from "@/components/Bird";

export type Box = { x: number; y: number; w: number; h: number };
export type Reach = { lift: number; sink: number };

export const SCENE_W = 390;
export const BIRD_SIZE = 120;
export const BIRD_SCALE = 0.64;
export const MIN_PERCHES = 3;
export const MAX_PERCHES = 5;

const BRICK_BAND = 44;
const FRONT_PARAPET = 192;
const RACK_LIFT = 84;
const FRONT_X = [148, 226, 304];
const BACK_X = [182, 260];
const COOP_X = 2;
const COOP_SCALE = 0.72;
const COOP_ART = { x: 6, y: 54, w: 186, h: 148 };
const COOP_SINK = 3;
const SLEEPER_ART: Box = { x: 49, y: 159, w: 44, h: 34 };
const OUT_TAG_ART: Box = { x: 114, y: 138, w: 36, h: 18 };
const PLANK = { w: 70, h: 8, under: 4 };

export type LoftLayout = {
  perches: number;
  width: number;
  height: number;
  parapetY: number;
  slots: Box[];
  planks: Box[];
  rack: { beamY: number; x: number; w: number } | null;
  coop: { x: number; y: number; scale: number; art: Box };
  sleeperBox: Box;
  outTagBox: Box;
  waterTower: Box;
};

export const ownedPerches = (perches: number) =>
  Math.min(MAX_PERCHES, Math.max(MIN_PERCHES, Math.floor(perches)));

const slotW = BIRD_SIZE * BIRD_SCALE;
const slotH = perchedHeight(BIRD_SIZE) * BIRD_SCALE;

const slotOn = (x: number, feetY: number): Box => ({
  x,
  y: feetY - slotH,
  w: slotW,
  h: slotH,
});

const plankUnder = (slot: Box): Box => ({
  x: slot.x + (slot.w - PLANK.w) / 2,
  y: slot.y + slot.h - PLANK.under,
  w: PLANK.w,
  h: PLANK.h,
});

const fromCoopArt = (
  art: Box,
  coop: { x: number; y: number; scale: number },
): Box => ({
  x: coop.x + (art.x - COOP_ART.x) * coop.scale,
  y: coop.y + (art.y - COOP_ART.y) * coop.scale,
  w: art.w * coop.scale,
  h: art.h * coop.scale,
});

export function loftLayout(perches: number): LoftLayout {
  const owned = ownedPerches(perches);
  const hasRack = owned > FRONT_X.length;
  const parapetY = hasRack ? FRONT_PARAPET + 26 : FRONT_PARAPET;
  const beamY = parapetY - RACK_LIFT;
  const slots = [
    ...FRONT_X.map((x) => slotOn(x, parapetY)),
    ...BACK_X.map((x) => slotOn(x, beamY)),
  ].slice(0, owned);
  const coop = {
    x: COOP_X,
    y: parapetY + COOP_SINK - COOP_ART.h * COOP_SCALE,
    scale: COOP_SCALE,
    art: COOP_ART,
  };
  return {
    perches: owned,
    width: SCENE_W,
    height: parapetY + BRICK_BAND,
    parapetY,
    slots,
    planks: slots.map(plankUnder),
    rack: hasRack ? { beamY, x: 172, w: 172 } : null,
    coop,
    sleeperBox: fromCoopArt(SLEEPER_ART, coop),
    outTagBox: fromCoopArt(OUT_TAG_ART, coop),
    waterTower: { x: 342, y: parapetY - 126, w: 50.4, h: 66.2 },
  };
}

export const idleEnvelope = (slot: Box, reach: Reach): Box => ({
  x: slot.x,
  y: slot.y - reach.lift * BIRD_SCALE,
  w: slot.w,
  h: slot.h + (reach.lift + reach.sink) * BIRD_SCALE,
});

export const intersects = (a: Box, b: Box) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export const inside = (box: Box, width: number, height: number) =>
  box.x >= 0 && box.y >= 0 && box.x + box.w <= width && box.y + box.h <= height;
