import { describe, expect, it } from "vitest";
import { maxIdleReach } from "./loftIdle";
import {
  idleEnvelope,
  inside,
  intersects,
  loftLayout,
  type Box,
} from "./loftLayout";

const CAPACITIES = [
  { perches: 3, height: 236, rack: false },
  { perches: 4, height: 262, rack: true },
  { perches: 5, height: 262, rack: true },
] as const;

const pairs = <T>(xs: readonly T[]) =>
  xs.flatMap((a, i) => xs.slice(i + 1).map((b) => [a, b] as const));

describe("loft layout by owned perches (ac-1, ac-3)", () => {
  for (const { perches, height, rack } of CAPACITIES) {
    describe(`${perches} perches`, () => {
      const layout = loftLayout(perches);

      it(`is 390 wide and ${height} tall, ${rack ? "with" : "without"} the upper rack`, () => {
        expect([layout.width, layout.height]).toEqual([390, height]);
        expect(layout.rack !== null).toBe(rack);
      });

      it("has one slot and one plank per owned perch, each slot inside the scene", () => {
        expect(layout.slots).toHaveLength(perches);
        expect(layout.planks).toHaveLength(perches);
        for (const slot of layout.slots) {
          expect(inside(slot, layout.width, layout.height)).toBe(true);
        }
      });

      it("keeps every slot box apart from every other, the sleeper and the OUT tag", () => {
        const boxes: Box[] = [
          ...layout.slots,
          layout.sleeperBox,
          layout.outTagBox,
        ];
        for (const [a, b] of pairs(boxes)) {
          expect(intersects(a, b), JSON.stringify([a, b])).toBe(false);
        }
      });

      it("keeps the boxes apart and inside the scene with the idle motion at its furthest", () => {
        const envelopes = layout.slots.map((s) =>
          idleEnvelope(s, maxIdleReach()),
        );
        for (const e of envelopes) {
          expect(inside(e, layout.width, layout.height)).toBe(true);
        }
        for (const [a, b] of pairs([
          ...envelopes,
          layout.sleeperBox,
          layout.outTagBox,
        ])) {
          expect(intersects(a, b), JSON.stringify([a, b])).toBe(false);
        }
      });

      it("lays each plank under its own slot's feet", () => {
        layout.planks.forEach((plank, i) => {
          const slot = layout.slots[i];
          expect(plank.x).toBeGreaterThanOrEqual(slot.x);
          expect(plank.x + plank.w).toBeLessThanOrEqual(slot.x + slot.w);
          expect(plank.y).toBeLessThan(slot.y + slot.h);
          expect(plank.y + plank.h).toBeGreaterThan(slot.y + slot.h);
        });
      });
    });
  }

  it("gives slot boxes at least 44 pt each way", () => {
    for (const slot of loftLayout(5).slots) {
      expect(slot.w).toBeGreaterThanOrEqual(44);
      expect(slot.h).toBeGreaterThanOrEqual(44);
    }
  });

  it("puts the front row on the parapet and the 4th and 5th perches on the rack", () => {
    const five = loftLayout(5);
    expect(five.slots.map((s) => s.x)).toEqual([148, 226, 304, 182, 260]);
    expect(five.slots.slice(0, 3).map((s) => s.y + s.h)).toEqual([
      218, 218, 218,
    ]);
    expect(five.slots.slice(3).map((s) => s.y + s.h)).toEqual([134, 134]);
    expect(five.rack?.beamY).toBe(134);
    expect(loftLayout(4).slots.map((s) => s.x)).toEqual([148, 226, 304, 182]);
  });

  it("clamps the owned count to the 3 to 5 perches the game sells", () => {
    expect(loftLayout(2).slots).toHaveLength(3);
    expect(loftLayout(9).slots).toHaveLength(5);
  });
});
