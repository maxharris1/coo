import { config } from "@/lib/config";
import { fill, type Pronoun } from "@/lib/format";
import type { Db } from "@/server/db";
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

type NotifyCopy = typeof config.copy.notifications;
export type NotifyKind = Exclude<keyof NotifyCopy, "_about">;

export function notificationText(
  kind: NotifyKind,
  vars: Record<string, string | number>,
  pronoun?: Pronoun,
): { title: string; body: string; url: string } {
  const copy = config.copy.notifications[kind];
  return {
    title: fill(copy.title, vars, pronoun),
    body: fill(copy.body, vars, pronoun),
    url: fill(copy.url, vars, pronoun),
  };
}

export function landedInTitle(title: string, gear: readonly string[]): string {
  return gear.includes("bell") ? `${title} Ding.` : title;
}

export async function recordNotification(
  db: Db,
  nowMs: number,
  row: NotifyRow,
): Promise<{ id: string } | null> {
  const now = new Date(nowMs).toISOString();
  const [created] = await db.query<{ id: string }>(
    `insert into notifications (user_id, kind, ref_id, title, body, url, created_at)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (user_id, kind, ref_id) where ref_id is not null do nothing
     returning id`,
    [row.userId, row.kind, row.refId, row.title, row.body, row.url ?? "/", now],
  );
  if (!created) return null;
  await db.query(
    "insert into events (user_id, kind, created_at) values ($1, 'notification', $2)",
    [row.userId, now],
  );
  return created;
}

/** Delivers only on a fresh insert, so a retried caller never pushes twice. */
export async function notify(
  deps: Deps,
  row: NotifyRow,
): Promise<{ id: string } | null> {
  const inserted = await deps.db.tx((db) =>
    recordNotification(db, deps.clock.now(), row),
  );
  if (inserted) await deliver(deps, inserted.id);
  return inserted;
}
