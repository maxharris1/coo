import { describe, expect, it } from "vitest";
import {
  deliveryPay,
  jobPay,
  tipFor,
  type IsoWeekday,
  type Wearer,
} from "@/lib/game/seeds";

const plain = (landedLocalWeekday: IsoWeekday) => ({
  partyHat: false,
  landedLocalWeekday,
});
const party = (landedLocalWeekday: IsoWeekday) => ({
  partyHat: true,
  landedLocalWeekday,
});

describe("deliveryPay", () => {
  it("pays 10 + 1 per full 25 miles for the first 10 deliveries of the day", () => {
    expect(deliveryPay(81, 0, plain(3))).toBe(13);
    expect(deliveryPay(81, 9, plain(3))).toBe(13);
  });

  it("pays 2 from the eleventh delivery of the day", () => {
    expect(deliveryPay(81, 10, plain(3))).toBe(2);
  });

  it.each([
    [6, 18],
    [7, 18],
    [5, 13],
  ] as const)(
    "pays a party hat on weekday %d %d seeds",
    (weekday, seedsPaid) => {
      expect(deliveryPay(81, 0, party(weekday))).toBe(seedsPaid);
    },
  );

  it("adds the party hat bonus to reduced pay", () => {
    expect(deliveryPay(81, 10, party(6))).toBe(7);
  });
});

describe("tipFor", () => {
  it.each<[Wearer, number]>([
    [{ breed: "city", gear: [] }, 5],
    [{ breed: "city", gear: ["bow"] }, 6],
    [{ breed: "fantail", gear: [] }, 10],
    [{ breed: "fantail", gear: ["bow"] }, 12],
  ])("tips %o %d seeds", (bird, seedsPaid) => {
    expect(tipFor(bird)).toBe(seedsPaid);
  });
});

describe("jobPay", () => {
  it.each([
    [0, { ok: true, seeds: 15 }],
    [2, { ok: true, seeds: 15 }],
    [3, { ok: true, seeds: 7 }],
    [5, { ok: true, seeds: 7 }],
    [6, { ok: false, reason: "daily_cap" }],
  ])("pays a 15 seed job after %d jobs today %o", (done, result) => {
    expect(jobPay({ pay: 15 }, done)).toEqual(result);
  });
});

describe("determinism", () => {
  it("gives equal outputs for the same inputs", () => {
    const birds: Wearer[] = [
      { breed: "city", gear: [] },
      { breed: "fantail", gear: ["bow", "party"] },
    ];
    for (const n of [0, 3, 10]) {
      expect(deliveryPay(81, n, party(6))).toEqual(
        deliveryPay(81, n, party(6)),
      );
      expect(jobPay({ pay: 15 }, n)).toEqual(jobPay({ pay: 15 }, n));
    }
    for (const bird of birds) expect(tipFor(bird)).toEqual(tipFor(bird));
  });
});
