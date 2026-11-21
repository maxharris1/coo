import { config } from "@/lib/config";
import { sunTimes } from "@/lib/flight/engine";
import { localHour, startOfLocalDayMs } from "@/lib/game/time";
import { loftTimeZone } from "@/server/loftTimeZone";
import type { BadgeRule } from "../badges";
import { setBadgeProgress } from "./award";

const NOON_MS = 12 * 3_600_000;

export const earlyBird: BadgeRule = {
  async apply(db, event) {
    if (event.kind !== "delivery-landed") return;
    const [row] = await db.query<{
      release_at: Date;
      landed_at: Date;
      from_lat: number;
      from_lon: number;
      timezone: string;
    }>(
      `select f.release_at, f.landed_at, f.from_lat, f.from_lon, p.timezone
       from flights f join profiles p on p.id = f.owner_id
       where f.id = $1 and f.owner_id = $2 and f.kind = 'delivery'
         and f.landed_at is not null`,
      [event.flightId, event.ownerId],
    );
    if (!row) return;
    const releaseMs = row.release_at.getTime();
    const loft = { lat: row.from_lat, lon: row.from_lon };
    const loftNoonMs =
      startOfLocalDayMs(releaseMs, loftTimeZone(loft)) + NOON_MS;
    if (
      localHour(releaseMs, row.timezone) <
        config.game.badges.earlyBirdBeforeHour &&
      releaseMs >= sunTimes(loftNoonMs, loft).sunriseMs
    )
      await setBadgeProgress(
        db,
        event.ownerId,
        "early-bird",
        1,
        row.landed_at.toISOString(),
      );
  },
};
