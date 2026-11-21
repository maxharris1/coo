import { describe, expect, it } from "vitest";
import vectors from "../../../../../../reference/flight-engine/vectors.json";
import type { FlightInput, FlightPlan } from "@/lib/flight/engine";
import type { Flight } from "@/server/services/flights/shape";
import type { SyncBird } from "../../../send/write/compose";
import { incidentReport, type IncidentContext } from "./incident";

const MAJOR = vectors.vectors.find((v) => v.name === "delay-major")!;
const INPUT = MAJOR.input as FlightInput;
const PLAN = MAJOR.plan as FlightPlan;
const DELAY = PLAN.segments.find((s) => s.kind === "delay")!;
const DURING = DELAY.startMs + 60_000;

const bird = (over: Partial<SyncBird> = {}): SyncBird =>
  ({
    id: "kevin",
    name: "Kevin",
    pronoun: "he",
    detours: 4,
    breed: "city",
    speedMph: 45,
    level: 1,
    focus: 2,
    navigation: 3,
    belly: 80,
    feathers: 80,
    energy: 80,
    sulking: false,
    gear: [],
    status: "flying",
    busyKind: null,
    busyUntil: null,
    hungry: false,
    tired: false,
    canFly: false,
    ...over,
  }) as SyncBird;

const KEVIN = bird();
const GERALD = bird({
  id: "gerald",
  name: "Gerald",
  status: "home",
  canFly: true,
  detours: 0,
});

function flight(over: Partial<Flight> = {}): Flight {
  return {
    id: INPUT.flightId,
    kind: "delivery",
    status: "flying",
    bird: { id: "kevin", name: "Kevin", look: "kevin", gear: [] },
    owner: { id: "u1", name: "Max", handle: "max" },
    counterpart: { id: "theo", name: "Theo", handle: "theo" },
    from: { ...INPUT.from, label: "Brooklyn" },
    to: { ...INPUT.to, label: "Philly" },
    releaseAt: INPUT.departAtMs,
    arriveAt: PLAN.arriveAtMs,
    distanceMi: PLAN.distanceMi,
    plan: PLAN,
    input: INPUT,
    placeNames: { "2": "Trenton" },
    role: "mine",
    hasNote: true,
    ...over,
  };
}

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
      { label: "Last seen", value: "Trenton, 10:21 am" },
      { label: "Cause", value: "Found a pretzel. Chose the pretzel." },
      { label: "Your note", value: "Still attached. Probably." },
    ]);
  });

  it("puts the last-seen place on the sign", () => {
    expect(report.place).toBe("Trenton");
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
