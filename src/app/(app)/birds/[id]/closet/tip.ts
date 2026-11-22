import { config } from "@/lib/config";
import { pronounTokens, type Pronoun } from "@/lib/format";
import type { GearId } from "@/lib/game/types";
import type { Forecast, ForecastKind } from "@/server/services/forecast";

export type TipIcon = "snow" | "rain";

export type Tip = {
  icon: TipIcon;
  headline: string;
  slowdown: string;
  button: string;
  counters: readonly GearId[];
};

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
    counters: ["beanie", "scarf"],
  },
  snowy: {
    speed: engine.snowSpeed,
    noun: "snow",
    icon: "snow",
    counters: ["scarf"],
  },
  wet: {
    speed: engine.rainSpeed,
    noun: "rain",
    icon: "rain",
    counters: ["rainhat", "goggles"],
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
  };
}
