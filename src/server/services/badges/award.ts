import { config } from "@/lib/config";
import type { FlightInput, FlightPlan } from "@/lib/flight/engine";
import type { Db } from "@/server/db";
import type { BadgeEvent, BadgeRule } from "../badges";

type Landing = {
  ownerId: string;
  distanceMi: number;
  input: FlightInput;
  plan: FlightPlan;
  landedAtIso: string;
};

type Progress = boolean | number;

type BadgeId = (typeof config.badges.badges)[number]["id"];

async function loadLanding(db: Db, event: BadgeEvent): Promise<Landing | null> {
  if (event.kind !== "delivery-landed") return null;
  const [row] = await db.query<{
    distance_mi: string | null;
    input: FlightInput;
    plan: FlightPlan;
    landed_at: Date;
  }>(
    `select distance_mi, input, plan, landed_at from flights
     where id = $1 and owner_id = $2 and kind = 'delivery' and landed_at is not null`,
    [event.flightId, event.ownerId],
  );
  if (!row) return null;
  return {
    ownerId: event.ownerId,
    distanceMi: Number(row.distance_mi ?? row.plan.distanceMi),
    input: row.input,
    plan: row.plan,
    landedAtIso: row.landed_at.toISOString(),
  };
}

export async function setBadgeProgress(
  db: Db,
  userId: string,
  badgeId: BadgeId,
  progress: number,
  atIso: string,
) {
  const { goal } = config.badges.badges.find((b) => b.id === badgeId)!;
  await db.query(
    `insert into badges (user_id, badge_id, progress, earned_at)
     values ($1, $2, $3::int, case when $3::int >= $4::int then $5::timestamptz end)
     on conflict (user_id, badge_id) do update set
       progress = greatest(badges.progress, excluded.progress),
       earned_at = coalesce(badges.earned_at, excluded.earned_at)`,
    [userId, badgeId, progress, goal, atIso],
  );
}

export function landingBadge(
  badgeId: BadgeId,
  progress: (landing: Landing, db: Db) => Progress | Promise<Progress>,
): BadgeRule {
  return {
    async apply(db, event) {
      const landing = await loadLanding(db, event);
      if (!landing) return;
      const n = Number(await progress(landing, db));
      if (n > 0)
        await setBadgeProgress(
          db,
          landing.ownerId,
          badgeId,
          n,
          landing.landedAtIso,
        );
    },
  };
}
