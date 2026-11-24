import { bearingDeg, haversineMi } from "@/lib/flight/engine";
import type { Flight } from "@/server/services/flights/shape";

// A fixed flight for eyeballing the tracker map without the API: Brooklyn to
// Philadelphia, carried by a fake bird, with the clock set to a summer noon
// (or 2 am for night) in New York so day and night don't depend on when the
// page is opened.

export const FLIGHT_MS = 100 * 60_000;
const NOON_MS = Date.UTC(2026, 5, 15, 16);
const NIGHT_MS = Date.UTC(2026, 5, 15, 6);

export type FakeParams = { night: boolean; progress: number; preview: boolean };

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function parseFake(
  params: Record<string, string | string[] | undefined>,
): FakeParams {
  const raw = Number(one(params.progress));
  const progress =
    Number.isFinite(raw) && one(params.progress)?.trim()
      ? Math.min(1, Math.max(0, raw))
      : 0.4;
  return {
    night: one(params.night) === "1",
    progress,
    preview: one(params.preview) === "1",
  };
}

export function fakeNow({ night }: FakeParams): number {
  return night ? NIGHT_MS : NOON_MS;
}

export function fakeFlight(params: FakeParams): Flight {
  const nowMs = fakeNow(params);
  const startMs = nowMs - params.progress * FLIGHT_MS;
  const endMs = startMs + FLIGHT_MS;
  const at = (frac: number) => startMs + frac * FLIGHT_MS;
  const from = { lat: 40.6782, lon: -73.9442, label: "Brooklyn" };
  const to = { lat: 39.9526, lon: -75.1652, label: "Philadelphia" };
  const distanceMi = haversineMi(from, to);
  return {
    id: "dev-map-flight",
    kind: "delivery",
    status: "flying",
    bird: { id: "dev-bird", name: "Gerald", look: "gerald", gear: [] },
    owner: { id: "dev-me", name: "You", handle: "you" },
    counterpart: { id: "dev-priya", name: "Priya", handle: "priya" },
    from,
    to,
    releaseAt: startMs,
    arriveAt: endMs,
    distanceMi,
    plan: {
      distanceMi,
      bearingDeg: bearingDeg(from, to),
      onTimeOdds: 1,
      delayed: false,
      delayKind: "none",
      arriveAtMs: endMs,
      segments: [{ kind: "fly", startMs, endMs, fromFrac: 0, toFrac: 1 }],
      events: [
        { atMs: at(0), kind: "takeoff", pick: 0 },
        { atMs: at(0.15), kind: "cruising", pick: 0 },
        { atMs: at(0.35), kind: "landmark", pick: 0 },
        { atMs: at(1), kind: "landing", pick: 0 },
      ],
    },
    placeNames: {
      deciles: [
        "Brooklyn",
        "Staten Island",
        "Perth Amboy",
        "Edison",
        "New Brunswick",
        "Princeton",
        "Trenton",
        "Levittown",
        "Bensalem",
        "Frankford",
        "Philadelphia",
      ],
    },
    role: "mine",
    hasNote: true,
  };
}
