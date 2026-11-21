import type { Deps } from "@/server/deps";
import { AppError } from "@/server/errors";
import type { UserId } from "@/server/ports/auth";
import { FLIGHT_SELECT, toFlight, type Flight, type FlightRow } from "./shape";

export async function getFlight(
  deps: Deps,
  viewerId: UserId,
  flightId: string,
): Promise<Flight> {
  const [row] = await deps.db.query<FlightRow>(
    `${FLIGHT_SELECT}
     where f.id = $2 and (f.owner_id = $1 or f.counterpart_id = $1)`,
    [viewerId, flightId],
  );
  if (!row) throw new AppError("not_found", "No such flight");
  return toFlight(row, viewerId);
}
