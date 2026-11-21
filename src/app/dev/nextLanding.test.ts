import { describe, expect, it } from "vitest";
import type { Flight } from "@/server/services/flights/shape";
import { nextLanding } from "./nextLanding";

const flight = (
  id: string,
  over: Partial<Pick<Flight, "kind" | "status" | "arriveAt" | "role">>,
): Flight =>
  ({
    id,
    kind: "delivery",
    status: "flying",
    role: "mine",
    releaseAt: 0,
    ...over,
  }) as Flight;

describe("nextLanding (ac-3)", () => {
  it("picks the earliest flying delivery, mine or incoming", () => {
    const flights = [
      flight("late", { arriveAt: 3_000 }),
      flight("incoming", { arriveAt: 1_000, role: "incoming" }),
      flight("mid", { arriveAt: 2_000 }),
    ];
    expect(nextLanding(flights)?.id).toBe("incoming");
    expect(
      nextLanding([flight("mine", { arriveAt: 500 }), ...flights])?.id,
    ).toBe("mine");
  });

  it("ignores scheduled, landed, cancelled and return flights", () => {
    const flights = [
      flight("scheduled", { status: "scheduled", arriveAt: 100 }),
      flight("landed", { status: "landed", arriveAt: 200 }),
      flight("cancelled", { status: "cancelled", arriveAt: 300 }),
      flight("return", { kind: "return", arriveAt: 400 }),
      flight("unknown", {}),
      flight("flying", { arriveAt: 5_000 }),
    ];
    expect(nextLanding(flights)?.id).toBe("flying");
  });

  it("is null when nothing is flying", () => {
    expect(nextLanding([])).toBeNull();
    expect(
      nextLanding([flight("landed", { status: "landed", arriveAt: 1 })]),
    ).toBeNull();
  });
});
