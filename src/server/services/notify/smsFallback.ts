import { config, type Config } from "@/lib/config";
import { fill } from "@/lib/format";
import { toE164 } from "@/lib/phone";
import type { Db } from "@/server/db";
import type { Deps } from "@/server/deps";
import { log } from "@/server/log";
import { SMS_UNSUBSCRIBED, SmsError } from "@/server/ports/sms";

export type SmsKind = Extract<
  keyof Config["copy"]["sms"],
  keyof Config["copy"]["notifications"]
>;

export type SmsOutcome =
  | { texted: true }
  | {
      texted: false;
      reason:
        | "missing"
        | "kind"
        | "setting-off"
        | "no-phone"
        | "claimed"
        | "rate-limited"
        | "unsubscribed"
        | "failed";
    };

type Names = { bird: string; friend: string };
type Resolver = (db: Db, refId: string) => Promise<Names | undefined>;

const MAX_LENGTH = 159;
const SMS_WINDOW_MS = 15 * 60_000;

const resolvers: Partial<Record<SmsKind, Resolver>> = {
  "landed-in": async (db, visitId) => {
    const [row] = await db.query<Names>(
      `select b.name as bird, owner.name as friend
       from visits v
       join birds b on b.id = v.bird_id
       join flights f on f.id = v.flight_id
       join profiles owner on owner.id = f.owner_id
       where v.id = $1`,
      [visitId],
    );
    return row;
  },
};

function isSmsKind(deps: Deps, kind: string): kind is SmsKind {
  const notifications: Record<string, unknown> = deps.config.copy.notifications;
  const copy = notifications[kind];
  return (
    kind in deps.config.copy.sms &&
    typeof copy === "object" &&
    copy !== null &&
    "sms" in copy &&
    copy.sms === true
  );
}

export function smsText(
  kind: SmsKind,
  vars: { bird: string; friend: string; url: string },
): string {
  const render = ({ bird, friend }: Names) =>
    fill(config.copy.sms[kind], {
      app: config.app.name,
      stop: config.app.sms.stopLine,
      url: vars.url,
      bird,
      friend,
    });
  const over = Math.max(0, render(vars).length - MAX_LENGTH);
  const friend = vars.friend
    .slice(0, Math.max(1, vars.friend.length - over))
    .trimEnd();
  const birdOver = over - (vars.friend.length - friend.length);
  const bird = vars.bird
    .slice(0, Math.max(1, vars.bird.length - birdOver))
    .trimEnd();
  return render({ bird, friend });
}

export async function smsFallback(
  deps: Deps,
  notificationId: string,
): Promise<SmsOutcome> {
  const [row] = await deps.db.query<{
    user_id: string;
    kind: string;
    ref_id: string | null;
    url: string;
    sms_fallback: boolean;
    phone: string | null;
  }>(
    `select n.user_id, n.kind, n.ref_id, n.url, p.sms_fallback, u.phone
     from notifications n
     join profiles p on p.id = n.user_id
     join auth.users u on u.id = n.user_id
     where n.id = $1`,
    [notificationId],
  );
  if (!row) return { texted: false, reason: "missing" };
  const { kind } = row;
  if (!isSmsKind(deps, kind)) return { texted: false, reason: "kind" };
  if (!row.sms_fallback) return { texted: false, reason: "setting-off" };
  const phone = row.phone === null ? null : toE164(row.phone);
  if (!phone) return { texted: false, reason: "no-phone" };

  const resolve = resolvers[kind];
  const names =
    resolve && row.ref_id ? await resolve(deps.db, row.ref_id) : undefined;
  if (!names) return { texted: false, reason: "missing" };
  const text = smsText(kind, {
    ...names,
    url: `https://${deps.config.app.domain}${row.url}`,
  });

  const now = deps.clock.now();
  const claim = await deps.db.tx(async (db) => {
    await db.query("select 1 from profiles where id = $1 for update", [
      row.user_id,
    ]);
    const [{ recent }] = await db.query<{ recent: number }>(
      `select count(*)::int as recent from notifications
       where user_id = $1 and id <> $2 and sms_sent_at > $3`,
      [
        row.user_id,
        notificationId,
        new Date(now - SMS_WINDOW_MS).toISOString(),
      ],
    );
    if (recent >= deps.config.game.limits.smsPerUserPer15Min) {
      return "rate-limited";
    }
    const claimed = await db.query(
      `update notifications set sms_sent_at = $2
       where id = $1 and sms_sent_at is null and read_at is null
       returning id`,
      [notificationId, new Date(now).toISOString()],
    );
    return claimed.length > 0 ? "texting" : "claimed";
  });
  if (claim !== "texting") return { texted: false, reason: claim };

  try {
    await deps.sms.send(phone, text);
  } catch (error) {
    if (error instanceof SmsError && error.code === SMS_UNSUBSCRIBED) {
      await deps.db.query(
        "update profiles set sms_fallback = false where id = $1",
        [row.user_id],
      );
      return { texted: false, reason: "unsubscribed" };
    }
    log.warn("sms.failed", {
      code:
        error instanceof SmsError
          ? error.code
          : error instanceof Error
            ? error.name
            : typeof error,
    });
    return { texted: false, reason: "failed" };
  }
  return { texted: true };
}
