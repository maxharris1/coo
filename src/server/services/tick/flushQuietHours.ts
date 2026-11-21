import { inQuietHours } from "@/lib/game/time";
import type { Row } from "@/server/rows";
import { pushNotification, type Setting, settings } from "../notify/deliver";
import type { Step } from "../tick";

const HELD_WINDOW_MS = 24 * 60 * 60_000;

type Candidate = Pick<
  Row<"profiles">,
  "timezone" | "quiet_on" | "quiet_start" | "quiet_end" | Setting
> & { id: string; kind: string; created_at: Date };

export const flushQuietHours: Step = async ({
  deps,
  userId,
  limit,
  timeUp,
}) => {
  const now = deps.clock.now();
  const rows = await deps.db.query<Candidate>(
    `select n.id, n.kind, n.created_at, p.timezone, p.quiet_on, p.quiet_start,
       p.quiet_end, p.notify_landed_in, p.notify_landed_out, p.notify_delays,
       p.notify_hungry
     from notifications n
     join profiles p on p.id = n.user_id
     where n.push_sent_at is null and n.read_at is null
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
      if (setting && !r[setting]) return false;
      const quiet = {
        on: r.quiet_on,
        startHour: r.quiet_start,
        endHour: r.quiet_end,
      };
      return (
        inQuietHours(r.created_at.getTime(), r.timezone, quiet) &&
        !inQuietHours(now, r.timezone, quiet)
      );
    })
    .slice(0, limit);

  let count = 0;
  for (const { id } of held) {
    if (timeUp()) break;
    if ((await pushNotification(deps, id)).pushed) count++;
  }
  return { count };
};
