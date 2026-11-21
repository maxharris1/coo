import { log } from "@/server/log";
import type { Row } from "@/server/rows";
import { pushNotification, type Setting, settings } from "../notify/deliver";
import type { Step } from "../tick";

const HELD_WINDOW_MS = 24 * 60 * 60_000;

type Candidate = Pick<Row<"profiles">, Setting> & { id: string; kind: string };

export const flushQuietHours: Step = async ({
  deps,
  userId,
  limit,
  timeUp,
}) => {
  const now = deps.clock.now();
  const rows = await deps.db.query<Candidate>(
    `select n.id, n.kind, p.notify_landed_in, p.notify_landed_out,
       p.notify_delays, p.notify_hungry
     from notifications n
     join profiles p on p.id = n.user_id
     where n.push_sent_at is null and n.read_at is null
       and n.push_held_until <= $2
       and n.created_at >= $1 and n.created_at <= $2
       and exists (select 1 from push_subscriptions s where s.user_id = n.user_id)
       and ($3::uuid is null or n.user_id = $3)
     order by n.created_at`,
    [
      new Date(now - HELD_WINDOW_MS).toISOString(),
      new Date(now).toISOString(),
      userId ?? null,
    ],
  );
  const kindSetting = settings(deps);
  const held = rows
    .filter((r) => {
      const setting = kindSetting.get(r.kind);
      return !setting || r[setting];
    })
    .slice(0, limit);

  let count = 0;
  let failed = 0;
  for (const { id } of held) {
    if (timeUp()) break;
    try {
      if ((await pushNotification(deps, id)).pushed) count++;
    } catch (error) {
      failed++;
      log.error("tick.row_failed", {
        step: "flushQuietHours",
        rowId: id,
        error,
      });
    }
  }
  return { count, failed };
};
