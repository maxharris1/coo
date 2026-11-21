import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Earn } from "@/server/services/earn";
import type { Flight } from "@/server/services/flights/shape";
import { EarnedCard, TrackerEarn, useEarned, type Earned } from "./TrackerEarn";

const NOW = Date.parse("2026-11-21T18:00:00Z");

const flight = (over: Partial<Flight> = {}): Flight => ({
  id: "f1",
  kind: "delivery",
  status: "landed",
  bird: { id: "b1", name: "Gerald", look: "gerald", gear: [] },
  owner: { id: "u1", name: "Max", handle: "max" },
  counterpart: { id: "u2", name: "Priya", handle: "priya" },
  from: { lat: 40.7, lon: -74, label: "Brooklyn" },
  to: { lat: 39.95, lon: -75.17, label: "Philly" },
  releaseAt: NOW - 120 * 60_000,
  arriveAt: NOW - 5 * 60_000,
  placeNames: {},
  role: "mine",
  hasNote: true,
  ...over,
});

const earnBody = (earned: Earn["earned"]) => ({
  seeds: 327,
  punchCard: {
    weekStart: "2026-11-16",
    deliveries: 10,
    size: 10,
    pay: 50,
    paid: true,
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
  earned,
});

const ALL_THREE: Earn["earned"] = {
  flightId: "f1",
  lines: [
    { reason: "delivery", seeds: 12 },
    { reason: "new_city", seeds: 25 },
    { reason: "punch_card", seeds: 50 },
  ],
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

let fetchMock: ReturnType<typeof vi.fn>;
let seen: (Earned | null)[];
let root: Root;

function Probe({ flight }: { flight: Flight }) {
  seen.push(useEarned(flight));
  return null;
}

const last = () => seen[seen.length - 1];

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function show(f: Flight) {
  await act(async () => root.render(<Probe flight={f} />));
  await settle();
}

beforeEach(() => {
  seen = [];
  fetchMock = vi.fn(async () => json(200, earnBody(ALL_THREE)));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), { HTMLIFrameElement: class {} }),
  );
  root = createRoot(
    Object.assign(new EventTarget(), {
      nodeType: 1,
      tagName: "DIV",
      ownerDocument: new EventTarget(),
    }) as unknown as Element,
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

describe("useEarned (ac-1)", () => {
  it("loads the ledger lines for my landed delivery and totals them", async () => {
    await show(flight());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/earn?flight=f1");
    expect(last()).toEqual({
      total: 87,
      lines: [
        { label: "Delivery", seeds: 12 },
        { label: "New city", seeds: 25 },
        { label: "Punch card", seeds: 50 },
      ],
    });
  });

  it("shows only the lines the ledger has", async () => {
    fetchMock.mockImplementation(async () =>
      json(
        200,
        earnBody({
          flightId: "f1",
          lines: [{ reason: "delivery", seeds: 13 }],
        }),
      ),
    );
    await show(flight());
    expect(last()).toEqual({
      total: 13,
      lines: [{ label: "Delivery", seeds: 13 }],
    });
  });

  it("asks nothing and shows nothing for an incoming flight", async () => {
    await show(flight({ role: "incoming" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(seen.every((s) => s === null)).toBe(true);
  });

  it("asks nothing and shows nothing while the flight is in the air", async () => {
    await show(flight({ status: "flying" }));
    await show(flight({ status: "scheduled" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(seen.every((s) => s === null)).toBe(true);
  });

  it("asks nothing for a bird flying home", async () => {
    await show(flight({ kind: "return" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(last()).toBeNull();
  });

  it("loads once the open flight lands", async () => {
    await show(flight({ status: "flying" }));
    expect(fetchMock).not.toHaveBeenCalled();
    await show(flight());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(last()?.total).toBe(87);
  });

  it("does not ask again on every tick", async () => {
    await show(flight());
    await show(flight());
    await show(flight());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("drops the last flight's card when another flight opens", async () => {
    await show(flight());
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
    await act(async () => root.render(<Probe flight={flight({ id: "f2" })} />));
    expect(last()).toBeNull();
    expect(fetchMock.mock.calls[1][0]).toBe("/api/earn?flight=f2");
  });

  it("shows nothing when the loft cannot be reached", async () => {
    fetchMock.mockImplementation(async () => {
      throw new TypeError("offline");
    });
    await show(flight());
    expect(last()).toBeNull();
  });

  it("shows nothing when the server refuses", async () => {
    fetchMock.mockImplementation(async () =>
      json(404, { error: { code: "not_found", message: "No such flight" } }),
    );
    await show(flight());
    expect(last()).toBeNull();
  });

  it("shows nothing when the ledger has no lines for the flight", async () => {
    fetchMock.mockImplementation(async () =>
      json(200, earnBody({ flightId: "f1", lines: [] })),
    );
    await show(flight());
    expect(last()).toBeNull();
  });
});

describe("EarnedCard (ac-1)", () => {
  it("says what the delivery earned, line by line", () => {
    const page = text(
      renderToStaticMarkup(
        <EarnedCard
          total={87}
          lines={[
            { label: "Delivery", seeds: 12 },
            { label: "New city", seeds: 25 },
            { label: "Punch card", seeds: 50 },
          ]}
        />,
      ),
    );
    expect(page).toBe(
      "You earned 87 seeds Delivery 12 New city 25 Punch card 50",
    );
  });
});

describe("TrackerEarn (ac-1)", () => {
  it("renders nothing for an incoming flight", () => {
    expect(
      renderToStaticMarkup(
        <TrackerEarn flight={flight({ role: "incoming" })} nowMs={NOW} />,
      ),
    ).toBe("");
  });

  it("renders nothing before the ledger lines arrive", () => {
    expect(
      renderToStaticMarkup(<TrackerEarn flight={flight()} nowMs={NOW} />),
    ).toBe("");
  });
});
