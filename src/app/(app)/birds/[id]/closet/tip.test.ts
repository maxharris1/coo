import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import type { Forecast } from "@/server/services/forecast";
import { tipFor } from "./tip";

const engine = config.game.engine;
const percentSlower = (speed: number) => Math.round((1 - speed) * 100);

const friday: Forecast = {
  day: "Friday",
  tempF: 31,
  kind: "cold",
  snow: true,
  rain: false,
};

describe("tipFor", () => {
  it("words the mock's cold, snowy Friday exactly", () => {
    expect(tipFor(friday, "he")).toMatchObject({
      headline: "Friday: 31 degrees and flurries",
      slowdown: "Underdressed birds fly 20% slower in the cold.",
      button: "Dress him",
      counters: ["beanie", "scarf"],
    });
  });

  it("leaves the weather off a dry cold day", () => {
    const tip = tipFor({ ...friday, snow: false }, "he");
    expect(tip?.headline).toBe("Friday: 31 degrees");
  });

  it("takes the cold slowdown from config", () => {
    expect(tipFor(friday, "he")?.slowdown).toContain(
      `${percentSlower(engine.coldSpeed)}% slower in the cold.`,
    );
  });

  it("warns about snow with the snow slowdown and the scarf", () => {
    const tip = tipFor(
      { day: "Sunday", tempF: 34, kind: "snowy", snow: true, rain: false },
      "he",
    );
    expect(tip).toMatchObject({
      headline: "Sunday: 34 degrees and flurries",
      slowdown: `Underdressed birds fly ${percentSlower(engine.snowSpeed)}% slower in the snow.`,
      counters: ["scarf"],
    });
  });

  it("warns about rain with the rain slowdown, rain hat first", () => {
    const tip = tipFor(
      { day: "Saturday", tempF: 48, kind: "wet", snow: false, rain: true },
      "he",
    );
    expect(tip).toMatchObject({
      headline: "Saturday: 48 degrees and rain",
      slowdown: `Underdressed birds fly ${percentSlower(engine.rainSpeed)}% slower in the rain.`,
      counters: ["rainhat", "goggles"],
    });
  });

  it("calls it flurries when snow and rain both fall", () => {
    const tip = tipFor({ ...friday, rain: true }, "he");
    expect(tip?.headline).toBe("Friday: 31 degrees and flurries");
  });

  it("says nothing when tomorrow is fine", () => {
    expect(
      tipFor(
        { day: "Friday", tempF: 60, kind: "none", snow: false, rain: false },
        "he",
      ),
    ).toBeNull();
  });

  it("dresses her and them by pronoun", () => {
    expect(tipFor(friday, "she")?.button).toBe("Dress her");
    expect(tipFor(friday, "they")?.button).toBe("Dress them");
  });
});
