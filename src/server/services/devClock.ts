import type { Db } from "../db";
import { AppError } from "../errors";
import type { UserId } from "../ports/auth";

export type ClockOp = { ref: string } & (
  { addMs: number } | { reset: true } | { toFlight: string }
);

type Ctx = { userId: UserId; baseNow: number };

type Row = { offset_ms: number };

const CALLERS_FLIGHT =
  "f.id = $1 and (f.owner_id = $2 or f.counterpart_id = $2)";

function update(tx: Db, op: ClockOp, { userId, baseNow }: Ctx): Promise<Row[]> {
  if ("addMs" in op) {
    return tx.query<Row>(
      "update dev_clock set offset_ms = offset_ms + $1 returning offset_ms",
      [op.addMs],
    );
  }
  if ("toFlight" in op) {
    return tx.query<Row>(
      `update dev_clock set offset_ms = greatest(offset_ms,
         ceil(extract(epoch from f.arrive_at) * 1000)::bigint + 1000 - $3)
       from flights f
       where ${CALLERS_FLIGHT} and f.status = 'flying'
       returning offset_ms`,
      [op.toFlight, userId, baseNow],
    );
  }
  return tx.query<Row>(
    "update dev_clock set offset_ms = 0 returning offset_ms",
  );
}

function current(tx: Db, op: ClockOp, { userId }: Ctx): Promise<Row[]> {
  return "toFlight" in op
    ? tx.query<Row>(
        `select offset_ms from dev_clock
         where exists (select 1 from flights f where ${CALLERS_FLIGHT})`,
        [op.toFlight, userId],
      )
    : tx.query<Row>("select offset_ms from dev_clock");
}

export function applyClockOp(
  db: Db,
  op: ClockOp,
  ctx: Ctx,
): Promise<{ offsetMs: number }> {
  return db.tx(async (tx) => {
    const claimed = await tx.query(
      `insert into rate_limits (key, window_start, count)
       values ('dev_clock:' || $1, to_timestamp(0), 1)
       on conflict (key, window_start) do nothing
       returning key`,
      [op.ref],
    );
    const [row] =
      claimed.length === 0
        ? await current(tx, op, ctx)
        : await update(tx, op, ctx);
    if (!row) throw new AppError("not_found", "Could not find that flight.");
    return { offsetMs: row.offset_ms };
  });
}
