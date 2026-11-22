import { activeLoft } from "@/lib/game/privacy";
import { startOfNextLocalDayMs } from "@/lib/game/time";
import type { Deps } from "@/server/deps";
import { AppError } from "@/server/errors";
import { loftTimeZone } from "@/server/loftTimeZone";
import type { UserId } from "@/server/ports/auth";
import {
  LOFT_COLUMNS,
  loftsOf,
  type LoftColumns,
} from "@/server/services/friends";
import { sampleWeather } from "@/server/services/weather";

export type ForecastKind = "cold" | "wet" | "snowy" | "none";

export type Forecast = {
  day: string;
  tempF: number;
  kind: ForecastKind;
  snow: boolean;
  rain: boolean;
};

const HOUR_MS = 3_600_000;
const SAMPLE_HOURS = [8, 12, 16];

export async function tomorrowAtLoft(
  deps: Deps,
  me: UserId,
): Promise<{ forecast: Forecast }> {
  const [mine] = await deps.db.query<LoftColumns>(
    `select ${LOFT_COLUMNS.join(", ")} from profiles where id = $1`,
    [me],
  );
  const roost = mine && activeLoft(loftsOf(mine))?.roost;
  if (!roost) throw new AppError("conflict", "Set up your loft first");

  const timeZone = loftTimeZone(roost);
  const start = startOfNextLocalDayMs(deps.clock.now(), timeZone);
  const { samples } = await sampleWeather(
    deps,
    SAMPLE_HOURS.map((h) => ({ ...roost, atMs: start + h * HOUR_MS })),
  );

  const { coldF, rainMmH } = deps.config.game.engine;
  const minTempF = Math.min(...samples.map((s) => s.tempF));
  const snow = samples.some((s) => s.snow);
  const rain = samples.some((s) => s.precipMmH >= rainMmH);
  const kind: ForecastKind =
    minTempF < coldF ? "cold" : snow ? "snowy" : rain ? "wet" : "none";
  const day = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone,
  }).format(start);

  return {
    forecast: { day, tempF: Math.round(minTempF), kind, snow, rain },
  };
}
