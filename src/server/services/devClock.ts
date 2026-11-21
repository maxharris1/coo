import type { Db } from "../db";

export type ClockOp = { ref: string } & ({ addMs: number } | { reset: true });

type Row = { offset_ms: number };

function update(tx: Db, op: ClockOp): Promise<Row[]> {
  return "addMs" in op
    ? tx.query<Row>(
        "update dev_clock set offset_ms = offset_ms + $1 returning offset_ms",
        [op.addMs],
      )
    : tx.query<Row>("update dev_clock set offset_ms = 0 returning offset_ms");
}

export function applyClockOp(
  db: Db,
  op: ClockOp,
): Promise<{ offsetMs: number }> {
  return db.tx(async (tx) => {
    const claimed = await tx.query(
      `insert into rate_limits (key, window_start, count)
       values ('dev_clock:' || $1, to_timestamp(0), 1)
       on conflict (key, window_start) do nothing
       returning key`,
      [op.ref],
    );
    const [{ offset_ms }] =
      claimed.length === 0
        ? await tx.query<Row>("select offset_ms from dev_clock")
        : await update(tx, op);
    return { offsetMs: offset_ms };
  });
}
