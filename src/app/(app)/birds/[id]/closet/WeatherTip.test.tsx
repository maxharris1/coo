import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  groundSpeedMph,
  type FlightInput,
  type WeatherSample,
} from "@/lib/flight/engine";
import type { GearId } from "@/lib/game/types";
import type { Forecast } from "@/server/services/forecast";
import { closetCells, pick, type ClosetBird } from "./closet";
import { TipBand } from "./WeatherTip";

const gerald = (gear: GearId[]): ClosetBird => ({
  id: "g",
  name: "Gerald",
  gear,
});

const coldFriday: Forecast = {
  day: "Friday",
  tempF: 31,
  kind: "cold",
  snow: true,
  rain: false,
};

const band = ({
  forecast = coldFriday,
  worn = [] as GearId[],
  closet = [] as string[],
  dress = vi.fn(),
} = {}) => {
  const cells = closetCells({ bird: gerald(worn), closet });
  return { pronoun: "he" as const, forecast, cells, worn, dress };
};

type Props = { children?: ReactNode; onClick?: () => void; href?: string };

const elements = (node: ReactNode): ReactElement<Props>[] => {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as ReactElement<Props>;
  return [el, ...elements(el.props.children)];
};

const tap = (props: ReturnType<typeof band>) => {
  const button = elements(TipBand(props)).find((el) => el.type === "button");
  if (!button) throw new Error("no Dress button");
  button.props.onClick?.();
};

describe("Wardrobe weather tip (ac-2)", () => {
  it("shows the forecast, the slowdown and a Dress button", () => {
    const html = renderToStaticMarkup(
      <TipBand {...band({ closet: ["beanie", "scarf"] })} />,
    );
    expect(html).toContain("Friday: 31 degrees and flurries");
    expect(html).toContain("Underdressed birds fly 20% slower in the cold.");
    expect(html).toMatch(/<button[^>]*>Dress him<\/button>/);
  });

  it("shows nothing when tomorrow is fine", () => {
    const html = renderToStaticMarkup(
      <TipBand
        {...band({
          forecast: { ...coldFriday, kind: "none", snow: false },
          closet: ["beanie", "scarf"],
        })}
      />,
    );
    expect(html).toBe("");
  });

  it("dresses the bird in the one counter that covers both cold and snow", () => {
    const dress = vi.fn();
    tap(band({ closet: ["beanie", "scarf"], dress }));
    expect(dress.mock.calls).toEqual([["scarf"]]);
  });

  it("reaches for the rain hat before the goggles in the rain", () => {
    const dress = vi.fn();
    tap(
      band({
        forecast: { ...coldFriday, kind: "wet", snow: false, rain: true },
        closet: ["goggles", "rainhat"],
        dress,
      }),
    );
    expect(dress).toHaveBeenCalledWith("rainhat");
  });

  it("sends you to the store when the closet has nothing for it", () => {
    const html = renderToStaticMarkup(
      <TipBand {...band({ closet: ["goggles"] })} />,
    );
    expect(html).toMatch(/<a[^>]*href="\/shop"[^>]*>Dress him<\/a>/);
    expect(html).not.toContain("<button");
  });

  it("drops the button when the bird is already dressed for it", () => {
    const html = renderToStaticMarkup(
      <TipBand {...band({ worn: ["scarf"], closet: ["beanie", "scarf"] })} />,
    );
    expect(html).toContain("Friday: 31 degrees and flurries");
    expect(html).not.toContain("Dress him");
  });
});

const ALL_GEAR = ["beanie", "scarf", "rainhat", "goggles"];

const speedIn = (weather: WeatherSample, gear: readonly GearId[]) => {
  const input: FlightInput = {
    flightId: "00000000-0000-0000-0000-000000000000",
    from: { lat: 0, lon: 0 },
    to: { lat: 1, lon: 0 },
    departAtMs: 0,
    bird: {
      speedMph: 50,
      focus: 3,
      navigation: 3,
      level: 1,
      belly: 100,
      feathers: 100,
      energy: 100,
      sulking: false,
    },
    gear: [...gear],
    weather: [weather, weather, weather],
  };
  return groundSpeedMph(input, 0, 0);
};

const dressedBy = (props: ReturnType<typeof band>, closet: string[]) => {
  let worn = props.worn;
  const dress = (item: GearId) => {
    const cell = closetCells({ bird: gerald(worn), closet }).find(
      (c) => c.item === item,
    );
    worn = (cell && pick(worn, cell)) ?? worn;
  };
  const button = elements(TipBand({ ...props, dress })).find(
    (el) => el.type === "button",
  );
  button?.props.onClick?.();
  return { worn, pressed: Boolean(button) };
};

const weatherFor = (f: Forecast, precipMmH: number): WeatherSample => ({
  windMph: 0,
  windFromDeg: 0,
  tempF: f.kind === "cold" ? 31 : 40,
  precipMmH: f.rain ? precipMmH : 0,
  snow: f.snow,
});

describe("Dress never costs the bird speed (f-2)", () => {
  it("keeps the rain hat and adds the scarf at 31 degrees in 5 mm/h rain", () => {
    const forecast: Forecast = {
      day: "Friday",
      tempF: 31,
      kind: "cold",
      snow: false,
      rain: true,
    };
    const weather = weatherFor(forecast, 5);
    const props = band({ forecast, worn: ["rainhat"], closet: ALL_GEAR });

    const { worn } = dressedBy(props, ALL_GEAR);

    expect(worn).toEqual(expect.arrayContaining(["rainhat", "scarf"]));
    expect(speedIn(weather, worn)).toBe(50);
    expect(speedIn(weather, worn)).toBeGreaterThan(
      speedIn(weather, ["rainhat"]),
    );
  });

  const kinds = ["cold", "snowy", "wet"] as const;
  const flags = [false, true];
  const forecasts = kinds
    .flatMap((kind) =>
      flags.flatMap((snow) =>
        flags.map((rain): Forecast => ({
          day: "Friday",
          tempF: 31,
          kind,
          snow,
          rain,
        })),
      ),
    )
    .filter(
      ({ kind, snow, rain }) =>
        kind === "cold" ||
        (kind === "snowy" && snow) ||
        (kind === "wet" && rain && !snow),
    );
  const outfits: GearId[][] = [
    [],
    ["beanie"],
    ["rainhat"],
    ["goggles"],
  ].flatMap((head) => [head, [...head, "scarf"]] as GearId[][]);
  const cases = forecasts.flatMap((forecast) =>
    outfits.map((worn) => ({ forecast, worn })),
  );

  it.each(cases)(
    "dresses for every condition of $forecast.kind snow=$forecast.snow rain=$forecast.rain from $worn",
    ({ forecast, worn }) => {
      const weather = weatherFor(forecast, 2);
      const before = speedIn(weather, worn);

      const after = dressedBy(
        band({ forecast, worn, closet: ALL_GEAR }),
        ALL_GEAR,
      );

      expect(speedIn(weather, after.worn)).toBeGreaterThanOrEqual(before);
      if (after.pressed) expect(speedIn(weather, after.worn)).toBe(50);
      else expect(before).toBe(50);
    },
  );
});
