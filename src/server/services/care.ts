import {
  bathDone,
  feed,
  napDone,
  projectCare,
  type CareOwner,
  type CareSnapshot,
} from "@/lib/game/care";
import type { OnboardedCaller, Profile } from "@/server/auth";
import type { Deps } from "@/server/deps";
import { AppError } from "@/server/errors";
import { toBirdRecord, type BirdRecord, type Row } from "@/server/rows";
import { toBirdView, type BirdView } from "./sync";

export type CareAction = "feed" | "bath" | "nap";
type Rest = "bath" | "nap";
type CareFn = typeof feed;

const MINUTE_MS = 60_000;

export const wakeEffect: Record<Rest, CareFn> = {
  bath: bathDone,
  nap: napDone,
};

type Spec = {
  cost: number;
  apply: CareFn;
  rest?: { kind: Rest; minutes: number };
};

function actions(deps: Deps): Record<CareAction, Spec> {
  const { care, seeds } = deps.config.game;
  return {
    feed: { cost: seeds.feedCost, apply: feed },
    bath: {
      cost: 0,
      apply: projectCare,
      rest: { kind: "bath", minutes: care.bathMinutes },
    },
    nap: {
      cost: 0,
      apply: projectCare,
      rest: { kind: "nap", minutes: care.napMinutes },
    },
  };
}

function snapshot(bird: BirdRecord): CareSnapshot {
  return {
    belly: bird.belly,
    feathers: bird.feathers,
    energy: bird.energy,
    careAtMs: bird.careAt,
    lastFedAtMs: bird.lastFedAt,
    hungryNotified: bird.hungryNotified,
    status: bird.status,
  };
}

function settled(
  bird: BirdRecord,
  nowMs: number,
  owner: CareOwner,
): CareSnapshot | null {
  if (bird.status === "home") return snapshot(bird);
  const { busyKind, busyUntil } = bird;
  if (bird.status !== "busy" || busyUntil === null || busyUntil > nowMs) {
    return null;
  }
  if (busyKind !== "bath" && busyKind !== "nap") return null;
  return {
    ...wakeEffect[busyKind](snapshot(bird), busyUntil, owner),
    status: "home",
  };
}

export async function careAction(
  deps: Deps,
  caller: OnboardedCaller,
  birdId: string,
  action: CareAction,
): Promise<{ bird: BirdView; seeds: number }> {
  const now = deps.clock.now();
  const owner = { hasBirdbath: caller.profile.has_birdbath };
  const { cost, apply, rest } = actions(deps)[action];
  return deps.db.tx(async (db) => {
    const [profile] = await db.query<Profile>(
      "select * from profiles where id = $1 for update",
      [caller.userId],
    );
    const [row] = await db.query<Row<"birds">>(
      "select * from birds where id = $1 and owner_id = $2 for update",
      [birdId, caller.userId],
    );
    if (!profile || !row) {
      throw new AppError("not_found", "Could not find that bird.");
    }
    const bird = toBirdRecord(row);
    const home = settled(bird, now, owner);
    if (!home) {
      throw new AppError("conflict", `${bird.name} is not home right now.`);
    }
    if (profile.seeds < cost) {
      throw new AppError("insufficient_seeds", "Not enough seeds for that.");
    }
    const [{ seeds }] =
      cost > 0
        ? await db.query<{ seeds: number }>(
            "select apply_seeds($1, $2, 'feed', null) as seeds",
            [caller.userId, -cost],
          )
        : [{ seeds: profile.seeds }];
    const care = apply(home, now, owner);
    const busyUntil = rest ? now + rest.minutes * MINUTE_MS : null;
    const [updated] = await db.query<Row<"birds">>(
      `update birds set belly = $2, feathers = $3, energy = $4,
         care_at = to_timestamp($5 / 1000.0), last_fed_at = to_timestamp($6 / 1000.0),
         hungry_notified = $7, status = $8, busy_kind = $9,
         busy_until = to_timestamp($10 / 1000.0)
       where id = $1 returning *`,
      [
        birdId,
        care.belly,
        care.feathers,
        care.energy,
        care.careAtMs,
        care.lastFedAtMs,
        care.hungryNotified,
        rest ? "busy" : "home",
        rest?.kind ?? null,
        busyUntil,
      ],
    );
    return { bird: toBirdView(toBirdRecord(updated), now, owner), seeds };
  });
}
