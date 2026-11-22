import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { GearId } from "@/lib/game/types";
import type { Forecast } from "@/server/services/forecast";
import { closetCells, type ClosetBird } from "./closet";
import { TipBand } from "./WeatherTip";

const gerald = (gear: GearId[]): ClosetBird => ({
  id: "g",
  name: "Gerald",
  status: "home",
  busyUntil: null,
  gear,
});

const brenda = (gear: GearId[]): ClosetBird => ({
  id: "b",
  name: "Brenda",
  status: "flying",
  busyUntil: null,
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
  others = [] as ClosetBird[],
  dress = vi.fn(),
} = {}) => {
  const bird = gerald(worn);
  const cells = closetCells({
    bird,
    birds: [bird, ...others],
    closet,
    now: 0,
  });
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

  it("dresses the bird in the first counter it can wear", () => {
    const dress = vi.fn();
    tap(band({ closet: ["beanie", "scarf"], dress }));
    expect(dress).toHaveBeenCalledWith("beanie");
  });

  it("skips a counter another bird has taken away", () => {
    const dress = vi.fn();
    tap(
      band({
        closet: ["beanie", "scarf"],
        others: [brenda(["beanie"])],
        dress,
      }),
    );
    expect(dress).toHaveBeenCalledWith("scarf");
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
