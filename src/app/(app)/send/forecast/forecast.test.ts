import { describe, expect, it } from "vitest";
import type {
  BirdQuote,
  RecipientQuote,
} from "@/server/services/flights/quote";
import { departures, forecastModel } from "./forecast";

const TZ = "America/New_York";
const HOUR_MS = 3_600_000;
const MINUTE_MS = 60_000;
const HOURS = [7, 9, 11, 13, 15];
const DAY_MS = 24 * HOUR_MS;
const friday = (hour: number, minute = 0) =>
  Date.UTC(2026, 10, 20, hour + 5, minute);
const SUNSET = friday(16, 34);
const NOW = friday(6, 30);
const GERALD = { id: "b1", name: "Gerald" };

function hourQuote(
  hour: number,
  odds: number,
  over: Partial<BirdQuote> = {},
): BirdQuote {
  const releaseAt = friday(hour);
  const durationMs = 2 * HOUR_MS + 6 * MINUTE_MS;
  return {
    birdId: GERALD.id,
    releaseAt,
    durationMs,
    arriveAt: releaseAt + durationMs,
    odds,
    roostsOvernight: false,
    factors: [],
    sunsetAt: SUNSET,
    ...over,
  };
}

function leg(quotes: BirdQuote[]): RecipientQuote {
  return {
    recipient: { friendId: "f1" } as RecipientQuote["recipient"],
    distanceMi: 82,
    from: { label: "Brooklyn" },
    to: { label: "Philadelphia" },
    quotes,
  };
}

const mockLeg = leg([
  hourQuote(7, 0.94),
  hourQuote(9, 0.92),
  hourQuote(11, 0.88),
  hourQuote(13, 0.81, {
    factors: [
      {
        kind: "headwind",
        text: "14 mph from the southwest",
        effect: "+18 min",
      },
      { kind: "rain", text: "Light rain along the route", effect: "6% off" },
      { kind: "hawk", text: "Hawks spotted along the route", effect: "4% off" },
      { kind: "fair", text: "Street fair along the route", effect: "3% off" },
    ],
  }),
  hourQuote(15, 0.81, {
    roostsOvernight: true,
    durationMs: 17 * HOUR_MS,
    arriveAt: friday(15) + 17 * HOUR_MS,
  }),
]);

describe("departures", () => {
  it("lists each forecast hour still ahead today, in order", () => {
    expect(departures(NOW, TZ, HOURS, DAY_MS)).toEqual(
      HOURS.map((h) => ({ at: friday(h), isNow: false })),
    );
  });

  it("makes the hour under way a chip that leaves now", () => {
    const now = friday(13, 20);
    expect(departures(now, TZ, HOURS, DAY_MS)).toEqual([
      { at: now, isNow: true },
      { at: friday(15), isNow: false },
      { at: friday(7) + DAY_MS, isNow: false },
      { at: friday(9) + DAY_MS, isNow: false },
      { at: friday(11) + DAY_MS, isNow: false },
    ]);
  });

  it("rolls hours that have passed to tomorrow and stays inside the window", () => {
    expect(departures(friday(16), TZ, HOURS, DAY_MS)).toEqual(
      HOURS.map((h) => ({ at: friday(h) + DAY_MS, isNow: false })),
    );
    expect(departures(NOW, TZ, HOURS, 3 * HOUR_MS)).toEqual([
      { at: friday(7), isNow: false },
      { at: friday(9), isNow: false },
    ]);
  });
});

describe("forecastModel on the mock's data", () => {
  const model = forecastModel(mockLeg, GERALD, friday(13), NOW, TZ, "mi");

  it("names the route, the day and the bird", () => {
    expect(model.route).toBe("Brooklyn to Philadelphia, Friday");
    expect(model.question).toBe("When should Gerald leave?");
  });

  it("draws one chip per hour with its odds, marking the roosting hour (ac-1)", () => {
    expect(
      model.chips.map(({ label, odds, roosts, selected }) => ({
        label,
        odds,
        roosts,
        selected,
      })),
    ).toEqual([
      { label: "7 am", odds: "94%", roosts: false, selected: false },
      { label: "9 am", odds: "92%", roosts: false, selected: false },
      { label: "11 am", odds: "88%", roosts: false, selected: false },
      { label: "1 pm", odds: "81%", roosts: false, selected: true },
      { label: "3 pm", odds: "81%", roosts: true, selected: false },
    ]);
  });

  it("describes the selected hour", () => {
    expect(model.selected).toEqual({
      odds: "81%",
      heading: "Arrival odds leaving at 1:00 pm",
      detail: "About 2h 06m. Lands near 3:06 pm.",
    });
  });

  it("lists the factors along the route", () => {
    expect(model.factors).toEqual([
      {
        kind: "headwind",
        title: "Headwind",
        text: "14 mph from the southwest",
        effect: "+18 min",
      },
      {
        kind: "rain",
        title: "Rain",
        text: "Light rain along the route",
        effect: "6% off",
      },
      {
        kind: "hawk",
        title: "Hawk advisory",
        text: "Hawks spotted along the route",
        effect: "4% off",
      },
      {
        kind: "fair",
        title: "Street fair",
        text: "Street fair along the route",
        effect: "3% off",
      },
    ]);
  });

  it("states the sunset", () => {
    expect(model.sunset).toBe(
      "Sunset is 4:34 pm. Birds still out at dusk roost for the night and finish the trip at sunrise.",
    );
  });

  it("offers the best hour and the selected hour as the two buttons", () => {
    expect(model.best).toEqual({
      at: friday(7),
      label: "Schedule for 7 am instead",
    });
    expect(model.send).toEqual({
      label: "Send at 1 pm anyway",
      releaseAt: friday(13),
    });
  });
});

describe("forecastModel on roosting hours (ac-1)", () => {
  it("never offers a roosting hour as the best, however good its odds", () => {
    const model = forecastModel(
      leg([hourQuote(13, 0.8), hourQuote(15, 0.99, { roostsOvernight: true })]),
      GERALD,
      friday(13),
      NOW,
      TZ,
      "mi",
    );
    expect(model.best?.at).toBe(friday(13));
  });

  it("offers no best hour when every hour roosts", () => {
    const model = forecastModel(
      leg([hourQuote(15, 0.8, { roostsOvernight: true })]),
      GERALD,
      friday(15),
      NOW,
      TZ,
      "mi",
    );
    expect(model.best).toBeNull();
    expect(model.send.label).toBe("Send at 3 pm");
  });

  it("says a roosting flight lands the next morning", () => {
    const model = forecastModel(mockLeg, GERALD, friday(15), NOW, TZ, "mi");
    expect(model.selected.detail).toBe(
      "About 17h 00m. Lands near 8:00 am tomorrow.",
    );
  });
});

describe("forecastModel for the hour under way", () => {
  const now = friday(13, 20);
  const model = forecastModel(
    leg([
      hourQuote(13, 0.9, { releaseAt: now }),
      hourQuote(15, 0.7, { roostsOvernight: true }),
    ]),
    GERALD,
    now,
    now,
    TZ,
    "mi",
  );

  it("labels the chip Now and sends at once", () => {
    expect(model.chips[0]).toMatchObject({ label: "Now", selected: true });
    expect(model.selected.heading).toBe("Arrival odds leaving now");
    expect(model.send).toEqual({ label: "Send now", releaseAt: undefined });
  });

  it("does not offer to schedule for now", () => {
    expect(model.best).toBeNull();
  });
});
