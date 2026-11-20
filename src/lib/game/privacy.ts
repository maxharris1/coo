import { config } from "@/lib/config";

export type Point = { lat: number; lon: number };
export type Loft = { roost: Point; cityCentre: Point | null };
export type LoftProfile = {
  travelOn: boolean;
  home: Loft | null;
  travel: Loft | null;
};
export type Shows = "block" | "city";

const { gridLatDeg, gridLonDeg } = config.game.roost;

function toGrid(value: number, step: number): number {
  const snapped = Math.round(Math.round(value / step) * step * 1e4) / 1e4;
  return snapped === 0 ? 0 : snapped;
}

export function snap(lat: number, lon: number): Point {
  return { lat: toGrid(lat, gridLatDeg), lon: toGrid(lon, gridLonDeg) };
}

export function activeLoft(profile: LoftProfile): Loft | null {
  return (profile.travelOn && profile.travel) || profile.home;
}

export function endpointFor(
  viewerShows: Shows,
  profile: LoftProfile,
): Point | null {
  const loft = activeLoft(profile);
  if (!loft) return null;
  return viewerShows === "block" ? loft.roost : loft.cityCentre;
}
