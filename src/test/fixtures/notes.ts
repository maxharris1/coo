import type { Db } from "@/server/db";
import type { Person, World } from "../seedWorld";

export type NoteOpts = { from?: Person; to?: Person; delivered?: boolean };

export async function addNote(
  t: Db,
  from: Person,
  to: Person,
  nowMs: number,
  delivered: boolean,
): Promise<string> {
  const now = new Date(nowMs).toISOString();
  const [{ id }] = await t.query<{ id: string }>(
    `insert into notes (sender_id, recipient_id, body, created_at, delivered_at)
     values ($1, $2, $3, $4, $5) returning id`,
    [
      from.id,
      to.id,
      `Test note from ${from.name}`,
      now,
      delivered ? now : null,
    ],
  );
  return id;
}

export async function insertNote(
  db: Db,
  world: World,
  nowMs: number,
  { from = world.max, to = world.priya, delivered = false }: NoteOpts = {},
): Promise<{ noteId: string }> {
  const noteId = await db.tx((t) => addNote(t, from, to, nowMs, delivered));
  return { noteId };
}

export function insertInAirNote(
  db: Db,
  world: World,
  nowMs: number,
  opts: Omit<NoteOpts, "delivered"> = {},
) {
  return insertNote(db, world, nowMs, { ...opts, delivered: false });
}

export function insertDeliveredNote(
  db: Db,
  world: World,
  nowMs: number,
  opts: Omit<NoteOpts, "delivered"> = {},
) {
  return insertNote(db, world, nowMs, { ...opts, delivered: true });
}
