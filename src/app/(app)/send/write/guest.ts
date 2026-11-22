import type { Point } from "@/lib/game/privacy";

export type Guest = { name: string; placeId: string; pin?: Point };

export const pinKey = (placeId: string) => `coo:pin:${placeId}`;

const within = (v: unknown, limit: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= limit;

function readPin(
  storage: Pick<Storage, "getItem">,
  placeId: string,
): Point | null {
  try {
    const raw = storage.getItem(pinKey(placeId));
    const p = raw
      ? (JSON.parse(raw) as Partial<Record<keyof Point, unknown>>)
      : null;
    return p && within(p.lat, 90) && within(p.lon, 180)
      ? { lat: p.lat, lon: p.lon }
      : null;
  } catch {
    return null;
  }
}

export function readGuest(
  params: URLSearchParams,
  storage: Pick<Storage, "getItem">,
): Guest | null {
  const name = params.get("guest")?.trim();
  const placeId = params.get("place");
  if (!name || !placeId) return null;
  const pin = readPin(storage, placeId);
  return pin ? { name, placeId, pin } : { name, placeId };
}
