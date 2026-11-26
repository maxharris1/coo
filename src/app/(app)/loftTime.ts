import { config } from "@/lib/config";
import { sunAltitudeDeg, type LatLon } from "@/lib/flight/engine";
import { hourIn } from "@/lib/format";

export type LoftTime = "sunrise" | "day" | "sunset" | "dusk" | "night";

const { thresholdsDeg, risingCheckMs } = config.loft.times;

export function loftTime(
  nowMs: number,
  loft: LatLon | null,
  timeZone: string,
): LoftTime {
  if (!loft) {
    const hour = hourIn(nowMs, timeZone);
    return hour >= 22 || hour < 5 ? "night" : "day";
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
