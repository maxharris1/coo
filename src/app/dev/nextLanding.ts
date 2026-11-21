import type { Flight } from "@/server/services/flights/shape";

type Landing = Flight & { arriveAt: number };

const isLanding = (f: Flight): f is Landing =>
  f.kind === "delivery" && f.status === "flying" && f.arriveAt !== undefined;

export function nextLanding(flights: Flight[]): Flight | null {
  return flights
    .filter(isLanding)
    .reduce<Landing | null>(
      (next, f) => (!next || f.arriveAt < next.arriveAt ? f : next),
      null,
    );
}
