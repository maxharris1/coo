import { z } from "zod";
import type { Deps } from "@/server/deps";
import { AppError } from "@/server/errors";
import type { UserId } from "@/server/ports/auth";
import { FLIGHT_SELECT, toFlight, type Flight, type FlightRow } from "./shape";

const FLIGHT_ID = z.uuid();

type LockedFlight = {
  id: string;
  owner_id: string;
  counterpart_id: string | null;
  status: Flight["status"];
  bird_id: string;
  note_id: string | null;
};

export async function cancelFlight(
  deps: Deps,
  me: UserId,
  flightId: string,
): Promise<{ flight: Flight }> {
  const missing = new AppError("not_found", "Could not find that flight.");
  if (!FLIGHT_ID.safeParse(flightId).success) throw missing;
  const now = deps.clock.now();
  return deps.db.tx(async (db) => {
    const [row] = await db.query<LockedFlight>(
      `select id, owner_id, counterpart_id, status, bird_id, note_id
       from flights where id = $1 for update`,
      [flightId],
    );
    if (!row || row.owner_id !== me) throw missing;
    if (row.status !== "scheduled") {
      throw new AppError("conflict", "That flight is no longer scheduled.");
    }

    await db.query(
      "update flights set status = 'cancelled' where id = $1 and status = 'scheduled'",
      [row.id],
    );
    await db.query(
      "update birds set status = 'home' where id = $1 and owner_id = $2 and status = 'scheduled'",
      [row.bird_id, me],
    );
    await db.query("delete from notes where id = $1", [row.note_id]);
    const people = row.counterpart_id
      ? [row.owner_id, row.counterpart_id]
      : [row.owner_id];
    await db.query(
      "insert into events (user_id, kind, created_at) select unnest($1::uuid[]), 'flight', $2",
      [people, new Date(now).toISOString()],
    );
    const [updated] = await db.query<FlightRow>(
      `${FLIGHT_SELECT} where f.id = $1`,
      [row.id],
    );
    return { flight: toFlight(updated, me) };
  });
}
