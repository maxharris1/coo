import type { Deps } from "@/server/deps";
import { FLIGHT_SELECT, toFlight, type Flight, type FlightRow } from "./shape";

const LANDED_WINDOW_MS = 24 * 60 * 60_000;

export type SyncFlight = Flight;

export async function syncFlights(
  deps: Deps,
  userId: string,
): Promise<SyncFlight[]> {
  const landedSince = new Date(deps.clock.now() - LANDED_WINDOW_MS);
  const rows = await deps.db.query<FlightRow>(
    `${FLIGHT_SELECT}
     where (f.owner_id = $1 or f.counterpart_id = $1)
       and (f.status in ('scheduled', 'flying')
         or (f.status = 'landed' and f.landed_at > $2))
     order by f.release_at`,
    [userId, landedSince.toISOString()],
  );
  return rows.map((r) => toFlight(r, userId));
}
