import type { Db } from "@/server/db";
import type { Person, World } from "../seedWorld";
import { addNote } from "./notes";

export type DeliveryOpts = {
  from?: Person;
  to?: Person;
  birdId?: string;
  id?: string;
};

export const HOUR_MS = 60 * 60_000;

export async function addDelivery(
  t: Db,
  from: Person,
  to: Person,
  birdId: string,
  noteId: string,
  status: "flying" | "landed",
  releaseMs: number,
  arriveMs: number,
  id?: string,
): Promise<string> {
  const arrive = new Date(arriveMs).toISOString();
  const [row] = await t.query<{ id: string }>(
    `insert into flights (id, kind, bird_id, owner_id, counterpart_id, note_id,
       from_lat, from_lon, from_label, to_lat, to_lon, to_label,
       status, release_at, arrive_at, landed_at, created_at)
     select coalesce($9::uuid, gen_random_uuid()), 'delivery', $1, s.id, r.id, $2,
       s.home_lat, s.home_lon, s.home_label, r.home_lat, r.home_lon, r.home_label,
       $3, $4, $5, $6, $4
     from profiles s, profiles r
     where s.id = $7 and r.id = $8
     returning id`,
    [
      birdId,
      noteId,
      status,
      new Date(releaseMs).toISOString(),
      arrive,
      status === "landed" ? arrive : null,
      from.id,
      to.id,
      id ?? null,
    ],
  );
  return row.id;
}

export async function insertFlyingDelivery(
  db: Db,
  world: World,
  nowMs: number,
  {
    from = world.max,
    to = world.priya,
    birdId = from.birds[0].id,
    id,
  }: DeliveryOpts = {},
): Promise<{ flightId: string; noteId: string; birdId: string }> {
  return db.tx(async (t) => {
    const noteId = await addNote(t, from, to, nowMs, false);
    const flightId = await addDelivery(
      t,
      from,
      to,
      birdId,
      noteId,
      "flying",
      nowMs,
      nowMs + HOUR_MS,
      id,
    );
    await t.query("update birds set status = 'flying' where id = $1", [birdId]);
    return { flightId, noteId, birdId };
  });
}
