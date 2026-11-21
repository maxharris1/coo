import type { Deps } from "@/server/deps";
import { AppError } from "@/server/errors";
import type { UserId } from "@/server/ports/auth";

export type BrowserSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export async function subscribe(
  deps: Deps,
  caller: UserId,
  sub: BrowserSubscription,
  userAgent: string | null,
): Promise<{ ok: true }> {
  await deps.db.query(
    `insert into push_subscriptions (user_id, endpoint, p256dh, auth, user_agent, created_at)
     values ($1, $2, $3, $4, $5, to_timestamp($6 / 1000.0))
     on conflict (endpoint) do update set
       user_id = excluded.user_id,
       p256dh = excluded.p256dh,
       auth = excluded.auth,
       user_agent = excluded.user_agent`,
    [
      caller,
      sub.endpoint,
      sub.keys.p256dh,
      sub.keys.auth,
      userAgent,
      deps.clock.now(),
    ],
  );
  return { ok: true };
}

export async function unsubscribe(
  deps: Deps,
  caller: UserId,
  endpoint: string,
): Promise<{ ok: true }> {
  const deleted = await deps.db.query<{ id: string }>(
    "delete from push_subscriptions where endpoint = $1 and user_id = $2 returning id",
    [endpoint, caller],
  );
  if (deleted.length === 0) {
    throw new AppError("not_found", "No such subscription.");
  }
  return { ok: true };
}
