import { interpolate, type LatLon } from "@/lib/flight/engine";
import { cityLabel } from "@/lib/places";
import type { GeoName } from "@/server/ports/geocoder";
import type { Deps } from "@/server/deps";

export type PlaceNames = {
  deciles: (string | null)[];
  events: Record<string, string>;
  dest: { city: string; region: string; country: string } | null;
};

const EMPTY: PlaceNames = { deciles: [], events: {}, dest: null };
const BUDGET_MS = 2_000;
const DECILES = 11;

export async function placeNames(
  deps: Deps,
  from: LatLon,
  to: LatLon,
): Promise<PlaceNames> {
  const names: (GeoName | null)[] = Array(DECILES).fill(null);
  const lookups = names.map(async (_, i) => {
    const point = interpolate(from, to, i / (DECILES - 1));
    names[i] = await deps.geocoder.reverse(point.lat, point.lon);
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, BUDGET_MS);
  });
  await Promise.race([Promise.allSettled(lookups), deadline]);
  clearTimeout(timer);

  const deciles = names.map((name) => (name ? cityLabel(name) : null));
  const last = names[DECILES - 1];
  const dest = last?.city
    ? {
        city: last.city,
        region: last.stateCode ?? last.state ?? "",
        country: last.country ?? "",
      }
    : null;

  if (!dest && deciles.every((name) => name === null)) return EMPTY;
  return { deciles, events: {}, dest };
}
