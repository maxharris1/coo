import type { BadgeRule } from "../badges";
import { setBadgeProgress } from "./award";

export const rfc1149: BadgeRule = {
  async apply(db, event) {
    const [row] = await db.query<{ landed_at: Date; n: number }>(
      `select f.landed_at,
         (select count(*)::int from flights r
          where r.owner_id = f.owner_id and r.kind = 'return'
            and r.status = 'landed' and r.note_id is not null) as n
       from flights f
       where f.id = $1 and f.owner_id = $2 and f.status = 'landed'`,
      [event.flightId, event.ownerId],
    );
    if (row && row.n > 0)
      await setBadgeProgress(
        db,
        event.ownerId,
        "rfc-1149",
        row.n,
        row.landed_at.toISOString(),
      );
  },
};
