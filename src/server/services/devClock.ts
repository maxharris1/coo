import type { Db } from "../db";

export async function addOffset(
  db: Db,
  deltaMs: number,
): Promise<{ offsetMs: number }> {
  const [{ offset_ms }] = await db.query<{ offset_ms: number }>(
    "update dev_clock set offset_ms = offset_ms + $1 returning offset_ms",
    [deltaMs],
  );
  return { offsetMs: offset_ms };
}

export async function resetOffset(db: Db): Promise<{ offsetMs: number }> {
  const [{ offset_ms }] = await db.query<{ offset_ms: number }>(
    "update dev_clock set offset_ms = 0 returning offset_ms",
  );
  return { offsetMs: offset_ms };
}
