import { z } from "zod";
import { noteLimit, validateBody } from "@/lib/game/notes";
import type { OnboardedCaller } from "@/server/auth";
import type { Deps } from "@/server/deps";
import { AppError } from "@/server/errors";
import { toBirdRecord, type Row } from "@/server/rows";
import { getFlight } from "../flights/get";
import type { Flight } from "../flights/shape";
import { returnLeg, startReturn } from "../tick/endVisits";

const VISIT_ID = z.uuid();

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
  text: string,
): Promise<{ flight: Flight }> {
  const missing = new AppError("not_found", "Could not find that visit.");
  if (!VISIT_ID.safeParse(visitId).success) throw missing;
  const now = deps.clock.now();
  const [visit] = await deps.db.query<{ host_id: string | null }>(
    "select host_id from visits where id = $1",
    [visitId],
  );
  if (!visit || visit.host_id !== caller.userId) throw missing;
  const leg = await returnLeg(deps, visitId, now);
  if (!leg)
    throw new AppError("conflict", "Your friend has no loft to fly to.");

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
    if (row.visit_status !== "waiting" || row.leaves_at.getTime() <= now) {
      throw new AppError("conflict", "The visit is over.");
    }
    const checked = validateBody(text, noteLimit(toBirdRecord(row)));
    if (!checked.ok)
      throw new AppError(
        "invalid",
        checked.reason === "empty"
          ? "body: write a note first"
          : `body: ${checked.length} of ${checked.limit} characters`,
      );

    const nowIso = new Date(now).toISOString();
    const [note] = await tx.query<{ id: string }>(
      `insert into notes (sender_id, recipient_id, reply_to, body, created_at)
       values ($1, $2, $3, $4, $5) returning id`,
      [caller.userId, row.owner_id, row.visit_note_id, checked.body, nowIso],
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
      note.id,
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

  return { flight: await getFlight(deps, caller.userId, flightId) };
}
