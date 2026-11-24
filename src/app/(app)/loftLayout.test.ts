import { describe, expect, it } from "vitest";
import {
  drawPose,
  GEAR_IDS,
  LOOKS,
  PERCH_VB,
  type Breed,
} from "@/components/Bird";
import { inkBounds } from "@/components/inkBounds";
import { GESTURES } from "./loftIdle";
import { artHeight, birdBox, loftLayout, type Box } from "./loftLayout";

const at = (rooms: Box[]) => rooms.map(({ x, y }) => [x, y]);
const GROUND = [
  [84, 298],
  [158, 298],
  [232, 298],
];
const UPPER = [
  [121, 218],
  [195, 218],
];

describe("loftLayout rooms and roof by floors", () => {
  it("builds one floor of three 74 by 80 rooms for 3 perches", () => {
    const loft = loftLayout(3);
    expect(at(loft.rooms)).toEqual(GROUND);
    expect(loft.rooms.every((r) => r.w === 74 && r.h === 80)).toBe(true);
    expect(loft.rooms.some((r) => r.toLet)).toBe(false);
    expect([loft.floors, loft.roof.peak]).toEqual([1, 254]);
  });

  it("builds a two-room second floor for 4 perches, the fifth room to let", () => {
    const loft = loftLayout(4);
    expect(at(loft.rooms)).toEqual([...GROUND, ...UPPER]);
    expect(loft.rooms.map((r) => r.toLet)).toEqual([
      false,
      false,
      false,
      false,
      true,
    ]);
    expect([loft.floors, loft.roof.peak]).toEqual([2, 178]);
  });

  it("fills both second-floor rooms for 5 perches", () => {
    const loft = loftLayout(5);
    expect(at(loft.rooms)).toEqual([...GROUND, ...UPPER]);
    expect(loft.rooms.some((r) => r.toLet)).toBe(false);
    expect([loft.floors, loft.roof.peak]).toEqual([2, 178]);
  });

  it("overhangs the top floor by 10 each side, under the right rise", () => {
    expect(loftLayout(3).roof).toEqual({
      x0: 74,
      x1: 316,
      eave: 298,
      peak: 254,
    });
    expect(loftLayout(5).roof).toEqual({
      x0: 111,
      x1: 279,
      eave: 218,
      peak: 178,
    });
  });

  it("clamps perches below 3 and above 5", () => {
    expect(loftLayout(1)).toEqual(loftLayout(3));
    expect(loftLayout(2.9)).toEqual(loftLayout(3));
    expect(loftLayout(9)).toEqual(loftLayout(5));
    expect(loftLayout(1).perches).toBe(3);
    expect(loftLayout(9).perches).toBe(5);
  });
});

describe("artHeight", () => {
  it("scales the 284 pt art below the sky band with screen width", () => {
    expect([320, 390, 430].map(artHeight)).toEqual([233, 284, 313]);
  });
});

describe("birdBox", () => {
  it("draws a 65 wide perched bird 5 in from the room's left, feet on the plank", () => {
    const room = loftLayout(5).rooms[3];
    const box = birdBox(room);
    const [, vy, vw, vh] = PERCH_VB.split(" ").map(Number);
    const k = box.w / vw;
    expect(box.w).toBe(65);
    expect(box.x).toBe(room.x + 5);
    expect(box.h).toBeCloseTo(vh * k);
    expect(box.y + (104 - vy) * k).toBe(room.y + 68);
  });
});

const BREEDS: Breed[] = [
  "city",
  "fantail",
  "pouter",
  "frillback",
  "jacobin",
  "king",
  "tumbler",
];

const perchedInk = () => {
  const all = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const look of LOOKS)
    for (const breed of BREEDS)
      for (const gear of [[], ...GEAR_IDS.map((g) => [g])]) {
        const b = inkBounds(drawPose(look, "perched", { breed, gear }).inner);
        all.x0 = Math.min(all.x0, b.x0);
        all.y0 = Math.min(all.y0, b.y0);
        all.x1 = Math.max(all.x1, b.x1);
        all.y1 = Math.max(all.y1, b.y1);
      }
  return all;
};

describe("perched birds in the loft rooms", () => {
  const ink = perchedInk();
  const [vx, vy, vw] = PERCH_VB.split(" ").map(Number);
  const rooms = loftLayout(5).rooms;

  for (const [name, { reach }] of Object.entries(GESTURES)) {
    it(`keeps every look, breed and gear inside its own room through ${name}`, () => {
      for (const room of rooms) {
        const box = birdBox(room);
        const k = box.w / vw;
        const unit = 70 / 120;
        const drawn = {
          left: box.x + (ink.x0 - vx) * k,
          right: box.x + (ink.x1 - vx) * k,
          top: box.y + (ink.y0 - vy) * k - reach.lift * unit,
          bottom: box.y + (ink.y1 - vy) * k + reach.sink * unit,
        };
        expect(drawn.left, JSON.stringify(room)).toBeGreaterThanOrEqual(room.x);
        expect(drawn.right).toBeLessThanOrEqual(room.x + room.w);
        expect(drawn.top).toBeGreaterThanOrEqual(room.y);
        expect(drawn.bottom).toBeLessThanOrEqual(room.y + room.h);
      }
    });
  }
});
