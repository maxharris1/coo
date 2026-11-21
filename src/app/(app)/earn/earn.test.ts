import { describe, expect, it, vi } from "vitest";
import type { LocalDate } from "@/lib/game/time";
import type { Earn } from "@/server/services/earn";
import { earnTop, loadEarn } from "./earn";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const MOCK: Earn = {
  seeds: 240,
  punchCard: {
    weekStart: "2026-11-16" as LocalDate,
    deliveries: 6,
    size: 10,
    pay: 50,
    paid: false,
  },
  payTable: {
    delivery: {
      base: 10,
      milesPerBonusSeed: 25,
      fullPayPerDay: 5,
      reducedPay: 2,
    },
    replyHome: 5,
    newCity: 25,
    partyHatWeekend: null,
  },
  jobs: { offers: [], leftToday: 2 },
  found: [],
  earned: null,
};

const withCard = (card: Partial<Earn["punchCard"]>): Earn => ({
  ...MOCK,
  punchCard: { ...MOCK.punchCard, ...card },
});

describe("earnTop", () => {
  it("draws the reference card: 6 of 10 punched, the last slot the prize", () => {
    const top = earnTop(MOCK);
    expect(top.seeds).toBe(240);
    expect(top.week).toBe("WEEK OF NOV 16");
    expect(top.stamps).toEqual([
      ...Array(6).fill("punched"),
      ...Array(3).fill("open"),
      "prize",
    ]);
    expect(top.line).toBe(
      "6 of 10 deliveries this week. A full card pays 50 seeds.",
    );
  });

  it("formats the week label from the local date with no time-zone shift", () => {
    expect(
      earnTop(withCard({ weekStart: "2027-01-04" as LocalDate })).week,
    ).toBe("WEEK OF JAN 4");
    expect(
      earnTop(withCard({ weekStart: "2026-12-28" as LocalDate })).week,
    ).toBe("WEEK OF DEC 28");
  });

  it("starts a fresh week with every slot open and the prize waiting", () => {
    const top = earnTop(withCard({ deliveries: 0 }));
    expect(top.stamps).toEqual([...Array(9).fill("open"), "prize"]);
    expect(top.line).toBe(
      "0 of 10 deliveries this week. A full card pays 50 seeds.",
    );
  });

  it("punches every slot once the card is full and says it paid", () => {
    const top = earnTop(withCard({ deliveries: 12, paid: true }));
    expect(top.stamps).toEqual(Array(10).fill("punched"));
    expect(top.line).toBe(
      "10 of 10 deliveries this week. The full card paid 50 seeds.",
    );
  });

  it("sizes the card and its pay from the payload", () => {
    const top = earnTop(withCard({ size: 6, deliveries: 2, pay: 30 }));
    expect(top.stamps).toEqual([
      "punched",
      "punched",
      "open",
      "open",
      "open",
      "prize",
    ]);
    expect(top.line).toBe(
      "2 of 6 deliveries this week. A full card pays 30 seeds.",
    );
  });

  it("lists the three reference pay rows when the party hat is not owned", () => {
    expect(earnTop(MOCK).pay).toEqual([
      { label: "A note lands", value: "10, plus 1 per 25 miles" },
      { label: "Your bird comes home with a reply", value: "5" },
      { label: "First landing in a new city", value: "25 and a postmark" },
    ]);
  });

  it("adds the party hat row only when the hat is owned", () => {
    const owned: Earn = {
      ...MOCK,
      payTable: { ...MOCK.payTable, partyHatWeekend: 5 },
    };
    const pay = earnTop(owned).pay;
    expect(pay).toHaveLength(4);
    expect(pay[3]).toEqual({
      label: "A weekend delivery in your party hat",
      value: "5 extra",
    });
  });

  it("takes every pay value from the payload", () => {
    const pay = earnTop({
      ...MOCK,
      payTable: {
        delivery: {
          base: 12,
          milesPerBonusSeed: 40,
          fullPayPerDay: 5,
          reducedPay: 2,
        },
        replyHome: 7,
        newCity: 30,
        partyHatWeekend: 9,
      },
    }).pay.map((row) => row.value);
    expect(pay).toEqual([
      "12, plus 1 per 40 miles",
      "7",
      "30 and a postmark",
      "9 extra",
    ]);
  });
});

describe("loadEarn", () => {
  it("GETs /api/earn and returns the payload", async () => {
    const fetchImpl = vi.fn(async () => json(200, MOCK));
    await expect(loadEarn(fetchImpl)).resolves.toEqual({
      ok: true,
      data: MOCK,
    });
    expect(fetchImpl).toHaveBeenCalledWith("/api/earn");
  });

  it("asks for one flight's earnings with ?flight=", async () => {
    const earned = {
      ...MOCK,
      earned: { flightId: "f-1", lines: [{ reason: "delivery", seeds: 12 }] },
    };
    const fetchImpl = vi.fn(async () => json(200, earned));
    await expect(loadEarn(fetchImpl, "f 1/2")).resolves.toEqual({
      ok: true,
      data: earned,
    });
    expect(fetchImpl).toHaveBeenCalledWith("/api/earn?flight=f%201%2F2");
  });

  it("passes the server's error message through", async () => {
    const fetchImpl = vi.fn(async () =>
      json(404, { error: { code: "not_found", message: "No such flight" } }),
    );
    await expect(loadEarn(fetchImpl, "f-1")).resolves.toEqual({
      ok: false,
      message: "No such flight",
      code: "not_found",
    });
  });

  it("falls back to a plain message when the network fails", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("offline");
    });
    const result = await loadEarn(fetchImpl);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/try again/i);
  });

  it("falls back to a plain message when the body is not JSON", async () => {
    const fetchImpl = vi.fn(
      async () => new Response("<html>", { status: 502 }),
    );
    const result = await loadEarn(fetchImpl);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/try again/i);
  });
});
