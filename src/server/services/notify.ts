import type { Deps } from "@/server/deps";
import { deliver } from "./notify/deliver";

export type NotifyRow = {
  userId: string;
  kind: string;
  refId: string;
  title: string;
  body: string;
  url?: string;
};

/** Delivers only on a fresh insert, so a retried caller never pushes twice. */
export async function notify(
  deps: Deps,
  row: NotifyRow,
): Promise<{ id: string } | null> {
  const now = new Date(deps.clock.now()).toISOString();
  const inserted = await deps.db.tx(async (db) => {
    const [created] = await db.query<{ id: string }>(
      `insert into notifications (user_id, kind, ref_id, title, body, url, created_at)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (user_id, kind, ref_id) where ref_id is not null do nothing
       returning id`,
      [
        row.userId,
        row.kind,
        row.refId,
        row.title,
        row.body,
        row.url ?? "/",
        now,
      ],
    );
    if (created)
      await db.query(
        "insert into events (user_id, kind, created_at) values ($1, 'notification', $2)",
        [row.userId, now],
      );
    return created ?? null;
  });
  if (inserted) await deliver(deps, inserted.id);
  return inserted;
}
