import { z } from "zod";
import type { OnboardedCaller } from "@/server/auth";
import type { Deps } from "@/server/deps";
import { AppError } from "@/server/errors";
import { pair, toBirdRecord, type Row } from "@/server/rows";
import {
  doodleParam,
  readyNote,
  type NoteInput,
} from "@/server/services/noteInput";
import { getFlight } from "../flights/get";
import type { Flight } from "../flights/shape";
import {
  returnRoute,
  sameRoute,
  startReturn,
  withWeather,
} from "../tick/endVisits";

const VISIT_ID = z.uuid();
const ROUTE_ATTEMPTS = 3;

type VisitBird = Row<"birds"> & {
  host_id: string | null;
  visit_status: string;
  leaves_at: Date;
  visit_note_id: string | null;
  guest_link_id: string | null;
};

export async function replyToVisit(
  deps: Deps,
  caller: OnboardedCaller,
  visitId: string,
  input: NoteInput,
): Promise<{ flight: Flight }> {
  const missing = new AppError("not_found", "Could not find that visit.");
  const noLoft = new AppError("conflict", "Your friend has no loft to fly to.");
  if (!VISIT_ID.safeParse(visitId).success) throw missing;
  const [visit] = await deps.db.query<{ host_id: string | null }>(
    "select host_id from visits where id = $1",
    [visitId],
  );
  if (!visit || visit.host_id !== caller.userId) throw missing;

  for (let attempt = 0; attempt < ROUTE_ATTEMPTS; attempt++) {
    const route = await returnRoute(deps.db, visitId);
    if (!route) throw noLoft;
    const leg = await withWeather(deps, route, deps.clock.now());

    const flightId = await deps.db.tx(async (tx) => {
      const [row] = await tx.query<VisitBird>(
        `select b.*, v.host_id, v.status as visit_status, v.leaves_at,
           v.note_id as visit_note_id, v.guest_link_id
         from visits v
         join birds b on b.id = v.bird_id
         where v.id = $1
         for update of v, b`,
        [visitId],
      );
      if (!row || row.host_id !== caller.userId) throw missing;
      await tx.query("select 1 from profiles where id = $1 for share", [
        row.owner_id,
      ]);
      await tx.query(
        "select 1 from friendships where a_id = $1 and b_id = $2 for share",
        pair(row.owner_id, caller.userId),
      );
      const now = deps.clock.now();
      if (row.visit_status !== "waiting" || row.leaves_at.getTime() <= now) {
        throw new AppError("conflict", "The visit is over.");
      }
      const current = await returnRoute(tx, visitId);
      if (!current) throw noLoft;
      if (!sameRoute(current, route)) return null;
      const note = readyNote(input, toBirdRecord(row));

      const nowIso = new Date(now).toISOString();
      const [noteRow] = await tx.query<{ id: string }>(
        `insert into notes (sender_id, recipient_id, reply_to, body, doodle, created_at)
         values ($1, $2, $3, $4, $5::jsonb, $6) returning id`,
        [
          caller.userId,
          row.owner_id,
          row.visit_note_id,
          note.body,
          doodleParam(note),
          nowIso,
        ],
      );
      const id = await startReturn(
        tx,
        now,
        leg,
        {
          bird_id: row.id,
          host_id: row.host_id,
          guest_link_id: row.guest_link_id,
        },
        noteRow.id,
      );
      await tx.query(
        "update visits set status = 'replied', return_flight_id = $2 where id = $1",
        [visitId, id],
      );
      await tx.query(
        "insert into events (user_id, kind, created_at) select unnest($1::uuid[]), 'flight', $2",
        [[row.owner_id, caller.userId], nowIso],
      );
      return id;
    });

    if (flightId)
      return { flight: await getFlight(deps, caller.userId, flightId) };
  }
  throw new AppError(
    "conflict",
    "Your friend just changed their loft. Try again.",
  );
}
