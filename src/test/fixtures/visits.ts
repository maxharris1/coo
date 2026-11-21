import type { Db } from "@/server/db";
import { config } from "@/lib/config";
import type { World } from "../seedWorld";
import { addDelivery, HOUR_MS, type DeliveryOpts } from "./flights";
import { addNote } from "./notes";

export async function insertWaitingVisit(
  db: Db,
  world: World,
  nowMs: number,
  {
    from = world.max,
    to = world.priya,
    birdId = from.birds[1].id,
  }: DeliveryOpts = {},
): Promise<{
  visitId: string;
  flightId: string;
  noteId: string;
  birdId: string;
}> {
  const leavesMs = nowMs + config.game.visits.waitMinutes * 60_000;
  return db.tx(async (t) => {
    const noteId = await addNote(t, from, to, nowMs, true);
    const flightId = await addDelivery(
      t,
      from,
      to,
      birdId,
      noteId,
      "landed",
      nowMs - HOUR_MS,
      nowMs,
    );
    const [{ id: visitId }] = await t.query<{ id: string }>(
      `insert into visits (flight_id, bird_id, host_id, note_id, arrived_at, leaves_at, status)
       values ($1, $2, $3, $4, $5, $6, 'waiting') returning id`,
      [
        flightId,
        birdId,
        to.id,
        noteId,
        new Date(nowMs).toISOString(),
        new Date(leavesMs).toISOString(),
      ],
    );
    await t.query("update birds set status = 'visiting' where id = $1", [
      birdId,
    ]);
    return { visitId, flightId, noteId, birdId };
  });
}
