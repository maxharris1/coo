import type { Flight } from "@/server/services/flights/shape";

type RoutePlaces = {
  deciles: (string | null)[];
  events: Record<string, string>;
};

const EMPTY: RoutePlaces = { deciles: [], events: {} };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function routePlaces(raw: unknown): RoutePlaces {
  if (!isRecord(raw)) return EMPTY;
  const deciles = Array.isArray(raw.deciles)
    ? raw.deciles.map((name) =>
        typeof name === "string" && name ? name : null,
      )
    : [];
  const events: Record<string, string> = {};
  if (isRecord(raw.events)) {
    for (const [key, name] of Object.entries(raw.events)) {
      if (typeof name === "string" && name) events[key] = name;
    }
  }
  return { deciles, events };
}

export function placeNear(flight: Flight, frac: number): string | undefined {
  const { deciles } = routePlaces(flight.placeNames);
  if (deciles.length === 0) return undefined;
  const clamped = Math.min(1, Math.max(0, frac));
  return deciles[Math.round(clamped * (deciles.length - 1))] ?? undefined;
}
