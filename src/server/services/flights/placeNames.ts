import type { LatLon } from "@/lib/flight/engine";
import type { Deps } from "@/server/deps";

export type PlaceNames = {
  deciles: string[];
  events: Record<string, string>;
  dest: { city: string; region: string; country: string } | null;
};

export const placeNames: (
  deps: Deps,
  from: LatLon,
  to: LatLon,
) => Promise<PlaceNames> = async () => ({
  deciles: [],
  events: {},
  dest: null,
});
