import { careAt, type CareOwner } from "@/lib/game/care";
import { levelFor } from "@/lib/game/levels";
import { noteLimit } from "@/lib/game/notes";
import { isTimeZone, weekStart } from "@/lib/game/time";
import type { BirdStatus } from "@/lib/game/types";
import type { OnboardedCaller, Profile } from "@/server/auth";
import type { Deps } from "@/server/deps";
import { log } from "@/server/log";
import type { UserId } from "@/server/ports/auth";
import {
  toBirdRecord,
  toMe,
  toOutfit,
  type BirdRecord,
  type Row,
} from "@/server/rows";
import { syncFlights } from "./flights/syncRead";
import { syncPhoneLast4 } from "./onboarding";
import { tick } from "./tick";
import { syncVisits } from "./visits/syncRead";

export type CannotFly = "away" | "busy" | "tired";

const blockedBy: Record<BirdStatus, CannotFly | null> = {
  home: null,
  flying: "away",
  visiting: "away",
  busy: "busy",
  scheduled: "busy",
};

export function toBirdView(b: BirdRecord, nowMs: number, owner: CareOwner) {
  const care = careAt(
    {
      belly: b.belly,
      feathers: b.feathers,
      energy: b.energy,
      careAtMs: b.careAt,
      lastFedAtMs: b.lastFedAt,
      hungryNotified: b.hungryNotified,
      status: b.status,
    },
    nowMs,
    owner,
  );
  const reason = blockedBy[b.status] ?? (care.canFly ? null : "tired");
  return {
    id: b.id,
    name: b.name,
    breed: b.breed,
    look: b.look,
    pronoun: b.pronoun,
    speedMph: b.speedMph,
    focus: b.focus,
    navigation: b.navigation,
    quirks: b.quirks,
    level: levelFor(b.miles),
    miles: b.miles,
    deliveries: b.deliveries,
    detours: b.detours,
    belly: care.belly,
    feathers: care.feathers,
    energy: care.energy,
    hungry: care.hungry,
    scruffy: care.scruffy,
    tired: care.tired,
    sulking: care.sulking,
    status: b.status,
    busyKind: b.busyKind,
    busyUntil: b.busyUntil,
    gear: b.gear,
    noteLimit: noteLimit(b),
    canFly: reason === null,
    ...(reason === null ? {} : { cannotFlyReason: reason }),
  };
}
export type BirdView = ReturnType<typeof toBirdView>;

async function backfillPhoneLast4(
  deps: Deps,
  id: UserId,
): Promise<Profile | null> {
  try {
    return await syncPhoneLast4(deps.db, id);
  } catch (err) {
    const code = err instanceof Error && "code" in err ? err.code : null;
    log.warn("sync.phone_last4_failed", {
      code: typeof code === "string" ? code : null,
    });
    return null;
  }
}

async function syncTimezone(
  deps: Deps,
  profile: Profile,
  timezone: string | null,
): Promise<Profile> {
  if (!timezone || timezone === profile.timezone || !isTimeZone(timezone)) {
    return profile;
  }
  const [updated] = await deps.db.query<Profile>(
    "update profiles set timezone = $2 where id = $1 and timezone <> $2 returning *",
    [profile.id, timezone],
  );
  if (updated) return updated;
  const [current] = await deps.db.query<Profile>(
    "select * from profiles where id = $1",
    [profile.id],
  );
  return current;
}

export async function sync(
  deps: Deps,
  caller: OnboardedCaller,
  timezone: string | null,
) {
  await tick(deps, { userId: caller.userId });
  const now = deps.clock.now();
  const id = caller.userId;
  const filled = await backfillPhoneLast4(deps, id);
  const [current] = filled
    ? [filled]
    : await deps.db.query<Profile>("select * from profiles where id = $1", [
        id,
      ]);
  const profile = await syncTimezone(deps, current, timezone);
  const week = weekStart(now, profile.timezone);
  const [
    birds,
    gear,
    outfits,
    eggs,
    cards,
    [jobs],
    mapJobs,
    found,
    [unread],
    [friends],
    flights,
    { visits, myVisiting },
  ] = await Promise.all([
    deps.db.query<Row<"birds">>(
      "select * from birds where owner_id = $1 order by hatched_at, id",
      [id],
    ),
    deps.db.query<{ gear_id: string }>(
      "select gear_id from gear_owned where user_id = $1 order by acquired_at, gear_id",
      [id],
    ),
    deps.db.query<Row<"outfits">>(
      "select * from outfits where user_id = $1 order by position, id",
      [id],
    ),
    deps.db.query<{ status: string; hatch_at_delivery: number }>(
      "select status, hatch_at_delivery from eggs where user_id = $1 and status <> 'hatched'",
      [id],
    ),
    deps.db.query<{ deliveries: number; paid: boolean }>(
      "select deliveries, paid from punch_cards where user_id = $1 and week_start = $2",
      [id, week],
    ),
    deps.db.query<{ running: number; done: number }>(
      "select count(*) filter (where status = 'running')::int as running, count(*) filter (where status = 'done')::int as done from jobs where user_id = $1",
      [id],
    ),
    deps.db.query<{ id: string; bird_id: string }>(
      "select id, bird_id from jobs where user_id = $1 and status = 'running' and dest_lat is not null",
      [id],
    ),
    deps.db.query<{ id: string }>(
      "select id from found_objects where user_id = $1 and traded_at is null order by found_at, id",
      [id],
    ),
    deps.db.query<{ count: number }>(
      "select count(*)::int as count from notifications where user_id = $1 and read_at is null",
      [id],
    ),
    deps.db.query<{ count: number }>(
      "select count(*)::int as count from friendships where status = 'accepted' and $1 in (a_id, b_id)",
      [id],
    ),
    syncFlights(deps, id),
    syncVisits(deps, id),
  ]);
  const [egg] = eggs;
  const [card] = cards;
  const jobOf = new Map(mapJobs.map((j) => [j.bird_id, j.id]));
  return {
    me: toMe(profile),
    birds: birds.map((r) => ({
      ...toBirdView(toBirdRecord(r), now, {
        hasBirdbath: profile.has_birdbath,
      }),
      jobId: jobOf.get(r.id) ?? null,
    })),
    closet: gear.map((g) => g.gear_id),
    outfits: outfits.map(toOutfit),
    flights,
    visits,
    myVisiting,
    egg: egg
      ? {
          status: egg.status,
          deliveriesToGo: Math.max(
            0,
            egg.hatch_at_delivery - profile.deliveries_count,
          ),
        }
      : null,
    punchCard: {
      weekStart: week,
      deliveries: card?.deliveries ?? 0,
      size: deps.config.game.seeds.punchCardSize,
      paid: card?.paid ?? false,
    },
    jobs,
    found: found.map((f) => f.id),
    unread: unread.count,
    friendsCount: friends.count,
  };
}
