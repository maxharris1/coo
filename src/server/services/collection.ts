import type { Config } from "@/lib/config";
import type { Deps } from "@/server/deps";
import type { UserId } from "@/server/ports/auth";

type BadgeId = Config["badges"]["badges"][number]["id"];

const RECENT_BIRDS = 5;

export type Collection = {
  account: string;
  postmarks: {
    city: string;
    region: string | null;
    country: string | null;
    earnedAt: number;
  }[];
  badges: {
    id: BadgeId;
    name: string;
    text: string;
    icon: string;
    goal: number;
    progress: number;
    earnedAt: number | null;
  }[];
  birdsMet: number;
  birdsMetRecent: {
    name: string;
    look: string;
    breed: string;
    gear: string[];
  }[];
};

export async function getCollection(
  deps: Deps,
  userId: UserId,
): Promise<Collection> {
  const postmarks = await deps.db.query<{
    city: string;
    region: string | null;
    country: string | null;
    earned_at: Date;
  }>(
    `select city, region, country, earned_at from postmarks
     where user_id = $1 order by earned_at desc, place_key`,
    [userId],
  );
  const badgeRows = await deps.db.query<{
    badge_id: string;
    progress: number;
    earned_at: Date | null;
  }>("select badge_id, progress, earned_at from badges where user_id = $1", [
    userId,
  ]);
  const recentRows = await deps.db.query<
    Collection["birdsMetRecent"][number] & { total: number }
  >(
    `select b.name, b.look, b.breed, b.gear, count(*) over () as total
     from bird_meetings m
     join birds b on b.id = m.bird_id
     where m.user_id = $1
     order by m.first_at desc, m.bird_id
     limit $2`,
    [userId, RECENT_BIRDS],
  );

  const rows = new Map(badgeRows.map((r) => [r.badge_id, r]));
  return {
    account: userId,
    postmarks: postmarks.map((p) => ({
      city: p.city,
      region: p.region,
      country: p.country,
      earnedAt: p.earned_at.getTime(),
    })),
    badges: deps.config.badges.badges.map((b) => {
      const row = rows.get(b.id);
      return {
        id: b.id,
        name: b.name,
        text: b.text,
        icon: b.icon,
        goal: b.goal,
        progress: Math.min(row?.progress ?? 0, b.goal),
        earnedAt: row?.earned_at?.getTime() ?? null,
      };
    }),
    birdsMet: recentRows[0]?.total ?? 0,
    birdsMetRecent: recentRows.map(({ name, look, breed, gear }) => ({
      name,
      look,
      breed,
      gear,
    })),
  };
}
