import type { BadgeRule } from "../badges";
import { setBadgeProgress } from "./award";

export const searchAndRescue: BadgeRule = {
  async apply(db, event) {
    if (event.kind !== "delivery-landed") return;
    const [row] = await db.query<{ landed_at: Date }>(
      `select landed_at from flights
       where id = $1 and owner_id = $2 and kind = 'delivery'
         and landed_at is not null and search_party = 'found'`,
      [event.flightId, event.ownerId],
    );
    if (row)
      await setBadgeProgress(
        db,
        event.ownerId,
        "search-and-rescue",
        1,
        row.landed_at.toISOString(),
      );
  },
};
