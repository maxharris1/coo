import { inQuietHours, quietHoursEnd, type QuietHours } from "@/lib/game/time";
import type { Db } from "@/server/db";
import type { Deps } from "@/server/deps";
import { log } from "@/server/log";
import {
  PushError,
  type PushPayload,
  type PushSubscription,
} from "@/server/ports/push";
import { COLUMNS, type Row } from "@/server/rows";
import { smsFallback, type SmsOutcome } from "./smsFallback";

export type PushOutcome =
  | { pushed: false; reason: "missing" | "read" | "claimed" }
  | { pushed: false; reason: "no-subscription" }
  | { pushed: true; sent: number; removed: number };

export type DeliverOutcome =
  | {
      pushed: false;
      reason: "missing" | "setting-off" | "quiet" | "read" | "claimed";
    }
  | { pushed: false; reason: "no-subscription"; sms: SmsOutcome }
  | { pushed: true; sent: number; removed: number; sms?: SmsOutcome };

export type Setting = Extract<keyof Row<"profiles">, `notify_${string}`>;

const GONE = new Set([404, 410]);

function isSetting(column: string | null): column is Setting {
  return (
    column !== null &&
    column.startsWith("notify_") &&
    column in COLUMNS.profiles
  );
}

export function settings(deps: Deps): ReadonlyMap<string, Setting> {
  return new Map(
    Object.entries(deps.config.copy.notifications).flatMap(([kind, copy]) =>
      typeof copy === "object" && isSetting(copy.setting)
        ? [[kind, copy.setting] as const]
        : [],
    ),
  );
}

type QuietPolicy = Pick<
  Row<"profiles">,
  "timezone" | "quiet_on" | "quiet_start" | "quiet_end"
>;

function quietHours(profile: QuietPolicy): QuietHours {
  return {
    on: profile.quiet_on,
    startHour: profile.quiet_start,
    endHour: profile.quiet_end,
  };
}

export async function rescheduleHeld(
  db: Db,
  now: number,
  profile: Row<"profiles">,
): Promise<void> {
  await db.query(
    `update notifications set push_held_until = $3
     where user_id = $1 and push_sent_at is null and read_at is null
       and push_held_until > $2`,
    [
      profile.id,
      new Date(now).toISOString(),
      new Date(
        quietHoursEnd(now, profile.timezone, quietHours(profile)),
      ).toISOString(),
    ],
  );
}

export async function holdIfQuiet(
  db: Db,
  now: number,
  notificationId: string,
): Promise<boolean> {
  return db.tx(async (tx) => {
    const [profile] = await tx.query<QuietPolicy>(
      `select p.timezone, p.quiet_on, p.quiet_start, p.quiet_end
       from notifications n
       join profiles p on p.id = n.user_id
       where n.id = $1
       for share of p`,
      [notificationId],
    );
    if (!profile) return false;
    const quiet = quietHours(profile);
    if (!inQuietHours(now, profile.timezone, quiet)) return false;
    await tx.query(
      `update notifications set push_held_until = $2
       where id = $1 and push_sent_at is null and read_at is null`,
      [
        notificationId,
        new Date(quietHoursEnd(now, profile.timezone, quiet)).toISOString(),
      ],
    );
    return true;
  });
}

export async function deliver(
  deps: Deps,
  notificationId: string,
): Promise<DeliverOutcome> {
  const [row] = await deps.db.query<Row<"profiles"> & { kind: string }>(
    `select n.kind, p.* from notifications n
     join profiles p on p.id = n.user_id
     where n.id = $1`,
    [notificationId],
  );
  if (!row) return { pushed: false, reason: "missing" };
  const setting = settings(deps).get(row.kind);
  if (setting && !row[setting]) return { pushed: false, reason: "setting-off" };
  if (await holdIfQuiet(deps.db, deps.clock.now(), notificationId)) {
    return { pushed: false, reason: "quiet" };
  }
  const outcome = await pushNotification(deps, notificationId);
  if (
    (outcome.pushed && outcome.sent === 0) ||
    (!outcome.pushed && outcome.reason === "no-subscription")
  ) {
    return { ...outcome, sms: await smsFallback(deps, notificationId) };
  }
  return outcome;
}

export async function pushNotification(
  deps: Deps,
  notificationId: string,
): Promise<PushOutcome> {
  const [state] = await deps.db.query<{
    user_id: string;
    read_at: Date | null;
    push_sent_at: Date | null;
  }>("select user_id, read_at, push_sent_at from notifications where id = $1", [
    notificationId,
  ]);
  if (!state) return { pushed: false, reason: "missing" };
  if (state.read_at) return { pushed: false, reason: "read" };
  if (state.push_sent_at) return { pushed: false, reason: "claimed" };
  const subs = await deps.db.query<PushSubscription>(
    "select endpoint, p256dh, auth from push_subscriptions where user_id = $1 order by endpoint",
    [state.user_id],
  );
  if (subs.length === 0) return { pushed: false, reason: "no-subscription" };

  const now = new Date(deps.clock.now()).toISOString();
  const [claimed] = await deps.db.query<{
    id: string;
    kind: string;
    ref_id: string | null;
    title: string;
    body: string;
    url: string;
  }>(
    `update notifications set push_sent_at = $2
     where id = $1 and push_sent_at is null and read_at is null
     returning id, kind, ref_id, title, body, url`,
    [notificationId, now],
  );
  if (!claimed) return { pushed: false, reason: "claimed" };

  const payload: PushPayload = {
    title: claimed.title,
    body: claimed.body,
    url: claimed.url,
    tag: `${claimed.kind}:${claimed.ref_id ?? claimed.id}`,
  };
  const results = await Promise.all(
    subs.map((sub) => sendTo(deps, sub, payload, now)),
  );
  return {
    pushed: true,
    sent: results.filter((r) => r === "sent").length,
    removed: results.filter((r) => r === "removed").length,
  };
}

async function sendTo(
  deps: Deps,
  sub: PushSubscription,
  payload: PushPayload,
  now: string,
): Promise<"sent" | "removed" | "failed"> {
  try {
    await deps.push.send(sub, payload);
  } catch (error) {
    if (error instanceof PushError && GONE.has(error.status)) {
      await deps.db.query(
        "delete from push_subscriptions where endpoint = $1",
        [sub.endpoint],
      );
      return "removed";
    }
    log.warn(
      "push.failed",
      error instanceof PushError
        ? { status: error.status }
        : { error: error instanceof Error ? error.name : typeof error },
    );
    return "failed";
  }
  await deps.db.query(
    "update push_subscriptions set last_ok_at = $2 where endpoint = $1",
    [sub.endpoint, now],
  );
  return "sent";
}
