import tzlookup from "tz-lookup";
import type { LatLon } from "@/lib/flight/engine";

export function loftTimeZone(loft: LatLon): string {
  return tzlookup(loft.lat, loft.lon);
}
