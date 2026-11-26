import { config } from "@/lib/config";
import { sunAltitudeDeg, type LatLon } from "@/lib/flight/engine";
import { hourIn } from "@/lib/format";

export type LoftTime = "sunrise" | "day" | "sunset" | "dusk" | "night";

const { thresholdsDeg, noLoftNight, risingCheckMs } = config.loft.times;

export function loftTime(nowMs: number, loft: LatLon): LoftTime;
export function loftTime(
  nowMs: number,
  loft: LatLon | null,
  timeZone: string,
): LoftTime;
export function loftTime(
  nowMs: number,
  loft: LatLon | null,
  timeZone?: string,
): LoftTime {
  if (!loft) {
    if (!timeZone) throw new Error("loftTime needs a time zone with no loft");
    const hour = hourIn(nowMs, timeZone);
    return hour >= noLoftNight.fromHour || hour < noLoftNight.untilHour
      ? "night"
      : "day";
  }
  const altitude = sunAltitudeDeg(nowMs, loft);
  if (altitude > thresholdsDeg.dayAbove) return "day";
  if (altitude >= thresholdsDeg.sunDownBelow) {
    const rising = sunAltitudeDeg(nowMs + risingCheckMs, loft) > altitude;
    return rising ? "sunrise" : "sunset";
  }
  if (altitude >= thresholdsDeg.nightBelow) return "dusk";
  return "night";
}
