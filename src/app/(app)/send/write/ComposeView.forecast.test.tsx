import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { FlightInput, FlightPlan } from "@/lib/flight/engine";
import { factorsFor } from "@/server/services/flights/factors";
import type { RecipientQuote } from "@/server/services/flights/quote";
import type { Units } from "@/lib/format";
import { stats } from "./compose";
import { ComposeView } from "./ComposeView";

type Vector = { name: string; input: FlightInput; plan: FlightPlan };

const vector: Vector = JSON.parse(
  readFileSync(
    join(process.cwd(), "reference/flight-engine/vectors.json"),
    "utf8",
  ),
).vectors.find((v: Vector) => v.name === "chicago-overnight");

function forecastFor(units: Units): string {
  const { input, plan } = vector;
  const factors = factorsFor(input, plan).filter((f) => f.kind === "distance");
  const leg: RecipientQuote = {
    recipient: { friendId: "f1" } as RecipientQuote["recipient"],
    distanceMi: plan.distanceMi,
    from: { label: "New York" },
    to: { label: "Chicago" },
    quotes: [
      {
        birdId: "b1",
        releaseAt: plan.segments[0].startMs,
        leavesAt: plan.segments[0].startMs,
        airTimeMs: plan.segments
          .filter((s) => s.kind === "fly")
          .reduce((sum, s) => sum + s.endMs - s.startMs, 0),
        durationMs: plan.arriveAtMs - plan.segments[0].startMs,
        arriveAt: plan.arriveAtMs,
        odds: plan.onTimeOdds,
        roostsOvernight: true,
        fliesInDark: false,
        factors,
        sunsetAt: plan.segments[0].startMs,
        espresso: null,
      },
    ],
  };
  return renderToStaticMarkup(
    <ComposeView
      rows={[
        {
          id: "f1",
          recipient: { name: "Priya", line: "Chicago" },
          pickedId: "b1",
          tooLong: false,
          stats: stats(leg, "b1", "America/New_York", units),
          forecastHref: "/send/forecast?to=f1",
        },
      ]}
      note="Hi"
      doodle={null}
      counter={{ text: "2 of 140 characters", over: false }}
      birds={[
        {
          id: "b1",
          name: "Gerald",
          speed: "45 mph",
          look: "gerald",
          breed: "city",
          gear: [],
          chip: "Ready",
          state: { kind: "ready" },
          wakes: false,
        },
      ]}
      sending={false}
      onNote={() => {}}
      onDoodle={() => {}}
      onPick={() => {}}
      onRelease={() => {}}
      onWake={() => {}}
    />,
  );
}

describe("the compose forecast on the chicago-overnight vector (ac-1)", () => {
  it("names the distance factor in kilometres for a km user", () => {
    const html = forecastFor("km");
    expect(html).toContain("1146 km is a long way");
    expect(html).not.toMatch(/\d+ mi\b/);
  });

  it("names the distance factor in miles for a mi user", () => {
    expect(forecastFor("mi")).toContain("712 mi is a long way");
  });
});
