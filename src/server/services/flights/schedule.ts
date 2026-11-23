import { careAt, type CareOwner } from "@/lib/game/care";
import { startOfLocalDayMs, startOfNextLocalDayMs } from "@/lib/game/time";
import { AppError } from "@/server/errors";
import { pair, toBirdRecord, type Row } from "@/server/rows";
import {
  LOFT_COLUMNS,
  loftsOf,
  type LoftColumns,
} from "@/server/services/friends";
import { doodleParam, readyNote } from "@/server/services/noteInput";
import { getFlight } from "./get";
import { endpointOf, legFor, snapshotOf } from "./quote";
import type { SendHook } from "./send";

const HOUR_MS = 3_600_000;

export const schedule: SendHook = async (deps, me, input) => {
  const now = deps.clock.now();
  const releaseAt = input.releaseAt ?? now;
  const last = now + deps.config.game.schedule.maxHoursAhead * HOUR_MS;
  if (releaseAt <= now || releaseAt > last)
    throw new AppError("invalid", "releaseAt: outside the schedule window");
  const [item, ...rest] = input.sends;
  if (!item || "guest" in item || rest.length > 0)
    throw new AppError(
      "invalid",
      "sends: scheduling is for one friend and one bird",
    );
  if (item.espresso)
    throw new AppError("invalid", "Espresso is for sending now.");
  const friend = item.friendId;
  const nowIso = new Date(now).toISOString();

  const flightId = await deps.db.tx(async (tx) => {
    await tx.query(
      "select 1 from profiles where id = any($1::uuid[]) order by id for update",
      [[me, friend]],
    );
    await tx.query(
      "select 1 from friendships where a_id = $1 and b_id = $2 for share",
      pair(me, friend),
    );
    const [mine] = await tx.query<
      LoftColumns & Pick<Row<"profiles">, "has_birdbath" | "timezone">
    >(
      `select ${LOFT_COLUMNS.join(", ")}, has_birdbath, timezone
       from profiles where id = $1`,
      [me],
    );
    const myLofts = mine && loftsOf(mine);
    const roost = myLofts && endpointOf("block", myLofts);
    if (!roost) throw new AppError("conflict", "Set up your loft first");
    const { from, to } = await legFor({ ...deps, db: tx }, me, myLofts, roost, {
      friendId: friend,
    });

    const [row] = await tx.query<Row<"birds">>(
      "select * from birds where id = $1 and owner_id = $2 for update",
      [item.birdId, me],
    );
    if (!row) throw new AppError("not_found", "No such bird");
    const bird = toBirdRecord(row);
    if (bird.status !== "home")
      throw new AppError("conflict", "That bird is not home");
    const owner: CareOwner = { hasBirdbath: mine.has_birdbath };
    if (!careAt(snapshotOf(bird), now, owner).canFly)
      throw new AppError("conflict", "That bird is too tired to fly");
    const note = readyNote(input, bird);

    const claimed = await tx.query(
      `update birds set status = 'scheduled'
       where id = $1 and owner_id = $2 and status = 'home' returning id`,
      [bird.id, me],
    );
    if (claimed.length === 0)
      throw new AppError("conflict", "That bird is not home");
    const [{ count: sentToday }] = await tx.query<{ count: number }>(
      `select count(*)::int from flights
       where owner_id = $1 and kind = 'delivery' and status <> 'cancelled'
         and created_at >= $2 and created_at < $3`,
      [
        me,
        new Date(startOfLocalDayMs(now, mine.timezone)).toISOString(),
        new Date(startOfNextLocalDayMs(now, mine.timezone)).toISOString(),
      ],
    );
    if (sentToday >= deps.config.game.limits.flightsPerDay)
      throw new AppError("rate_limited", "Too many requests. Try again later.");

    const [noteRow] = await tx.query<{ id: string }>(
      `insert into notes (sender_id, recipient_id, body, doodle, created_at)
       values ($1, $2, $3, $4::jsonb, $5) returning id`,
      [me, friend, note.body, doodleParam(note), nowIso],
    );
    const [flight] = await tx.query<{ id: string }>(
      `insert into flights (kind, bird_id, owner_id, counterpart_id, note_id,
         from_lat, from_lon, from_label, to_lat, to_lon, to_label, status,
         release_at, created_at)
       values ('delivery', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
         'scheduled', $11, $12)
       returning id`,
      [
        bird.id,
        me,
        friend,
        noteRow.id,
        from.point.lat,
        from.point.lon,
        from.label,
        to.point.lat,
        to.point.lon,
        to.label,
        new Date(releaseAt).toISOString(),
        nowIso,
      ],
    );
    return flight.id;
  });

  return { flights: [await getFlight(deps, me, flightId)] };
};
