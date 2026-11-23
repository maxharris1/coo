import type { Db } from "@/server/db";

export async function setShots(db: Db, user: string, shots: number) {
  await db.query("update profiles set espresso_shots = $2 where id = $1", [
    user,
    shots,
  ]);
}

export async function shotsOf(db: Db, user: string): Promise<number> {
  const [{ espresso_shots }] = await db.query<{ espresso_shots: number }>(
    "select espresso_shots from profiles where id = $1",
    [user],
  );
  return espresso_shots;
}
