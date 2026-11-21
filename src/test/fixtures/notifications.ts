import type { Db } from "@/server/db";
import type { World } from "../seedWorld";

export type NotificationOpts = {
  userId?: string;
  kind: string;
  refId: string | null;
  title?: string;
  body?: string;
};

export async function insertNotification(
  db: Db,
  world: World,
  nowMs: number,
  {
    userId = world.max.id,
    kind,
    refId,
    title = "Test notification",
    body = "Something happened",
  }: NotificationOpts,
): Promise<{ notificationId: string }> {
  return db.tx(async (t) => {
    const [{ id }] = await t.query<{ id: string }>(
      `insert into notifications (user_id, kind, title, body, ref_id, created_at)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [userId, kind, title, body, refId, new Date(nowMs).toISOString()],
    );
    return { notificationId: id };
  });
}
