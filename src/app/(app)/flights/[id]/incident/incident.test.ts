import { beforeAll, describe, expect, it } from "vitest";
import vectors from "../../../../../../reference/flight-engine/vectors.json";
import type { FlightPlan } from "@/lib/flight/engine";
import { placeNames } from "@/server/services/flights/placeNames";
import {
  FLIGHT_SELECT,
  toFlight,
  type Flight,
  type FlightRow,
} from "@/server/services/flights/shape";
import { makeTestDeps } from "@/test/deps";
import {
  DELAY,
  delayedFlight as flight,
  DURING,
  INPUT,
  PLAN,
  syncBird as bird,
} from "@/test/fixtures/delayedFlight";
import { insertFlyingDelivery } from "@/test/fixtures/flights";
import { seedWorld } from "@/test/seedWorld";
import { incidentReport, type IncidentContext } from "./incident";

const KEVIN = bird();
const GERALD = bird({
  id: "gerald",
  name: "Gerald",
  status: "home",
  canFly: true,
  detours: 0,
});

const ctx = (over: Partial<IncidentContext> = {}): IncidentContext => ({
  birds: [KEVIN, GERALD],
  delayedCount: 4,
  nowMs: DURING,
  timeZone: "America/New_York",
  units: "mi",
  ...over,
});

describe("incidentReport for the delay-major vector", () => {
  const report = incidentReport(flight(), ctx())!;

  it("numbers the report by the owner's delayed flights", () => {
    expect(report.reportNo).toBe("0004");
  });

  it("writes the headline and subline as drawn", () => {
    expect(report.headline).toBe("Kevin did not arrive");
    expect(report.sub).toBe(
      "Your note to Theo is running late. We told Theo a bird is on the way, eventually.",
    );
  });

  it("fills the five rows from the flight", () => {
    expect(report.rows).toEqual([
      { label: "Bird", value: "Kevin. 45 mph on a good day." },
      { label: "Route", value: "Brooklyn to Philly, 82 miles" },
      { label: "Last seen", value: "Trenton, NJ, 10:21 am" },
      { label: "Cause", value: "Found a pretzel. Chose the pretzel." },
      { label: "Your note", value: "Still attached. Probably." },
    ]);
  });

  it("puts the last-seen place on the sign", () => {
    expect(report.place).toBe("Trenton, NJ");
  });

  it("offers a search party at the configured cost and odds", () => {
    expect(report.search).toEqual({
      kind: "available",
      cost: 20,
      line: "20 seeds. 7 in 10 strays are back within the hour.",
    });
  });

  it("resends to the same friend with the bird Compose would pick", () => {
    expect(report.resend).toEqual({
      href: "/send/write?to=theo",
      label: "Resend with Gerald",
    });
  });

  it("counts the bird's detours in the footer", () => {
    expect(report.footer).toBe(
      "Kevin has wandered off 4 times. He has come home by dusk 4 times.",
    );
  });
});

describe("incidentReport edge cases", () => {
  it("is null when the flight never wandered off", () => {
    const calm = vectors.vectors.find((v) => v.name === "calm-short")!;
    const plan = calm.plan as FlightPlan;
    expect(incidentReport(flight({ plan }), ctx())).toBeNull();
    expect(incidentReport(flight({ plan: undefined }), ctx())).toBeNull();
  });

  it.each([
    ["found", "Found him. Back in the air."],
    ["not_found", "They found a different pigeon. Sorry."],
  ] as const)("shows the %s result once the party is used", (result, line) => {
    expect(
      incidentReport(flight({ searchParty: result }), ctx())!.search,
    ).toEqual({ kind: "done", line });
  });

  it("uses the bird's pronoun in the result and footer", () => {
    const they = bird({ pronoun: "they", detours: 1 });
    const report = incidentReport(
      flight({ searchParty: "found" }),
      ctx({ birds: [they, GERALD] }),
    )!;
    expect(report.search).toEqual({
      kind: "done",
      line: "Found them. Back in the air.",
    });
    expect(report.footer).toBe(
      "Kevin has wandered off 1 time. They have come home by dusk 1 time.",
    );
  });

  it.each([
    ["before the delay", DELAY.startMs - 1],
    ["after the delay", DELAY.endMs],
  ])("offers no search party %s", (_, nowMs) => {
    expect(incidentReport(flight(), ctx({ nowMs }))!.search).toEqual({
      kind: "unavailable",
    });
  });

  it("offers no search party on a minor delay", () => {
    const minor = { ...PLAN, delayKind: "minor" as const };
    const report = incidentReport(flight({ plan: minor }), ctx())!;
    expect(report.search).toEqual({ kind: "unavailable" });
    expect(report.rows[3].value).toBe("Brief disagreement with a crow.");
  });

  it("offers no search party to the recipient", () => {
    expect(incidentReport(flight({ role: "incoming" }), ctx())!.search).toEqual(
      { kind: "unavailable" },
    );
  });

  it("names a guest recipient and resends through the recipient list", () => {
    const report = incidentReport(
      flight({ counterpart: undefined, guestName: "Nana" }),
      ctx(),
    )!;
    expect(report.sub).toBe(
      "Your note to Nana is running late. We told Nana a bird is on the way, eventually.",
    );
    expect(report.resend).toEqual({
      href: "/send",
      label: "Resend with Gerald",
    });
  });

  it("has no resend when no other bird is ready", () => {
    const tired = { ...GERALD, canFly: false };
    expect(
      incidentReport(flight(), ctx({ birds: [KEVIN, tired] }))!.resend,
    ).toBeNull();
  });

  it("shows only the time when the delay point has no place name", () => {
    const report = incidentReport(flight({ placeNames: {} }), ctx())!;
    expect(report.rows[2]).toEqual({ label: "Last seen", value: "10:21 am" });
    expect(report.place).toBeNull();
  });

  it("measures the route in kilometres when the setting says so", () => {
    expect(incidentReport(flight(), ctx({ units: "km" }))!.rows[1]).toEqual({
      label: "Route",
      value: "Brooklyn to Philly, 132 kilometres",
    });
  });

  it("says when no note rides along", () => {
    expect(
      incidentReport(flight({ hasNote: false }), ctx())!.rows[4].value,
    ).toBe("Nothing attached this trip.");
  });
});

describe("incidentReport on place names stored by the real producer", () => {
  let stored: Flight;
  let decile: string | null;

  beforeAll(async () => {
    const deps = await makeTestDeps();
    const world = await seedWorld(deps.db, INPUT.departAtMs);
    const { flightId } = await insertFlyingDelivery(
      deps.db,
      world,
      INPUT.departAtMs,
    );
    const names = await placeNames(deps, INPUT.from, INPUT.to);
    decile = names.deciles[Math.round(DELAY.fromFrac * 10)];
    await deps.db.query(
      "update flights set plan = $2, input = $3, place_names = $4 where id = $1",
      [
        flightId,
        JSON.stringify(PLAN),
        JSON.stringify(INPUT),
        JSON.stringify(names),
      ],
    );
    const [row] = await deps.db.query<FlightRow>(
      `${FLIGHT_SELECT} where f.id = $1`,
      [flightId],
    );
    stored = toFlight(row, world.max.id);
  });

  it("puts the delay-point decile and time in Last seen", () => {
    const report = incidentReport(stored, ctx())!;
    expect(decile).toBe("Carteret, NJ");
    expect(report.place).toBe("Carteret, NJ");
    expect(report.rows[2]).toEqual({
      label: "Last seen",
      value: "Carteret, NJ, 10:21 am",
    });
  });
});
