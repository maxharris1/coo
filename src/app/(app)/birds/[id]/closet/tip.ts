import { config } from "@/lib/config";
import { pronounTokens, type Pronoun } from "@/lib/format";
import type { GearId } from "@/lib/game/types";
import type { Forecast, ForecastKind } from "@/server/services/forecast";

export type TipIcon = "snow" | "rain";

export type Condition = "cold" | "snow" | "rain";

export type Tip = {
  icon: TipIcon;
  headline: string;
  slowdown: string;
  button: string;
  counters: readonly GearId[];
  conditions: readonly Condition[];
};

export const protection: Record<Condition, readonly GearId[]> = {
  cold: ["beanie", "scarf"],
  snow: ["scarf"],
  rain: ["rainhat", "goggles"],
};

export const coveredBy = (
  worn: readonly GearId[],
  conditions: readonly Condition[],
): Condition[] =>
  conditions.filter((c) => protection[c].some((item) => worn.includes(item)));

const conditionsOf = ({ kind, snow, rain }: Forecast): Condition[] => [
  ...(kind === "cold" ? (["cold"] as const) : []),
  ...(snow ? (["snow"] as const) : []),
  ...(rain ? (["rain"] as const) : []),
];

type Weather = {
  speed: number;
  noun: string;
  icon: TipIcon;
  counters: readonly GearId[];
};

const engine = config.game.engine;

const weathers: Record<Exclude<ForecastKind, "none">, Weather> = {
  cold: {
    speed: engine.coldSpeed,
    noun: "cold",
    icon: "snow",
    counters: protection.cold,
  },
  snowy: {
    speed: engine.snowSpeed,
    noun: "snow",
    icon: "snow",
    counters: protection.snow,
  },
  wet: {
    speed: engine.rainSpeed,
    noun: "rain",
    icon: "rain",
    counters: protection.rain,
  },
};

const precipitation = ({ snow, rain }: Forecast) =>
  snow ? " and flurries" : rain ? " and rain" : "";

export function tipFor(forecast: Forecast, pronoun: Pronoun): Tip | null {
  if (forecast.kind === "none") return null;
  const { speed, noun, icon, counters } = weathers[forecast.kind];
  const percent = Math.round((1 - speed) * 100);
  return {
    icon,
    headline: `${forecast.day}: ${forecast.tempF} degrees${precipitation(forecast)}`,
    slowdown: `Underdressed birds fly ${percent}% slower in the ${noun}.`,
    button: `Dress ${pronounTokens(pronoun).him}`,
    counters,
    conditions: conditionsOf(forecast),
  };
}
