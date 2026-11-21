import type { Deps } from "@/server/deps";
import type { UserId } from "@/server/ports/auth";

const PAGE_SIZE = 50;

export type NotificationItem = {
  id: string;
  kind: string;
  title: string;
  body: string;
  url: string;
  createdAt: string;
  read: boolean;
};

type NotificationRow = {
  id: string;
  kind: string;
  title: string;
  body: string;
  url: string;
  created_at: Date;
  read: boolean;
};

export async function listNotifications(
  deps: Deps,
  caller: UserId,
): Promise<{ notifications: NotificationItem[] }> {
  const rows = await deps.db.query<NotificationRow>(
    `select id, kind, title, body, url, created_at, read_at is not null as read
     from notifications
     where user_id = $1
     order by created_at desc, id desc
     limit $2`,
    [caller, PAGE_SIZE],
  );
  return {
    notifications: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      title: r.title,
      body: r.body,
      url: r.url,
      createdAt: r.created_at.toISOString(),
      read: r.read,
    })),
  };
}

export async function markAllRead(
  deps: Deps,
  caller: UserId,
): Promise<{ unread: 0 }> {
  await deps.db.query(
    "update notifications set read_at = $2 where user_id = $1 and read_at is null",
    [caller, new Date(deps.clock.now()).toISOString()],
  );
  return { unread: 0 };
}
