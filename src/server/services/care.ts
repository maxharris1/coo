import { sameBirdName } from "@/lib/birdName";
import type { Pronoun } from "@/lib/format";
import {
  feed,
  projectCare,
  type CareOwner,
  type CareSnapshot,
} from "@/lib/game/care";
import type { OnboardedCaller, Profile } from "@/server/auth";
import type { Deps } from "@/server/deps";
import { AppError } from "@/server/errors";
import { toBirdRecord, type BirdRecord, type Row } from "@/server/rows";
import { assertBirdNameFree } from "./birdNames";
import { careSnapshot, wakeEffect } from "./care/snapshot";
import { toBirdView, type BirdView } from "./sync";

export type CareAction = "feed" | "bath" | "nap";
export type RenameInput = { name?: string; pronoun?: Pronoun };
type Rest = "bath" | "nap";
type CareFn = typeof feed;

const MINUTE_MS = 60_000;

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

function settled(
  bird: BirdRecord,
  nowMs: number,
  owner: CareOwner,
): CareSnapshot | null {
  if (bird.status === "home") return careSnapshot(bird);
  const { busyKind, busyUntil } = bird;
  if (bird.status !== "busy" || busyUntil === null || busyUntil > nowMs) {
    return null;
  }
  if (busyKind !== "bath" && busyKind !== "nap") return null;
  return {
    ...wakeEffect[busyKind](careSnapshot(bird), busyUntil, owner),
    status: "home",
  };
}

export async function careAction(
  deps: Deps,
  caller: OnboardedCaller,
  birdId: string,
  action: CareAction,
  ref: string | null,
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
    if (ref) {
      const [done] = await db.query(
        "select 1 from seed_ledger where user_id = $1 and reason = 'feed' and ref_id = $2",
        [caller.userId, ref],
      );
      if (done) {
        return { bird: toBirdView(bird, now, owner), seeds: profile.seeds };
      }
    }
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
            "select apply_seeds($1, $2, 'feed', $3) as seeds",
            [caller.userId, -cost, ref],
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

export async function renameBird(
  deps: Deps,
  caller: OnboardedCaller,
  birdId: string,
  input: RenameInput,
): Promise<{ bird: BirdView }> {
  const row = await deps.db.tx(async (db) => {
    await db.query("select 1 from profiles where id = $1 for update", [
      caller.userId,
    ]);
    const [bird] = await db.query<Pick<Row<"birds">, "name">>(
      "select name from birds where id = $1 and owner_id = $2",
      [birdId, caller.userId],
    );
    if (!bird) throw new AppError("not_found", "Could not find that bird.");
    if (input.name !== undefined && !sameBirdName(input.name, bird.name)) {
      await assertBirdNameFree(db, caller.userId, input.name, birdId);
    }
    const [updated] = await db.query<Row<"birds">>(
      `update birds set name = coalesce($2, name), pronoun = coalesce($3, pronoun)
       where id = $1 returning *`,
      [birdId, input.name ?? null, input.pronoun ?? null],
    );
    return updated;
  });
  return {
    bird: toBirdView(toBirdRecord(row), deps.clock.now(), {
      hasBirdbath: caller.profile.has_birdbath,
    }),
  };
}

export async function wakeBird(
  deps: Deps,
  caller: OnboardedCaller,
  birdId: string,
): Promise<{ bird: BirdView }> {
  const now = deps.clock.now();
  const owner = { hasBirdbath: caller.profile.has_birdbath };
  return deps.db.tx(async (db) => {
    const [row] = await db.query<Row<"birds">>(
      "select * from birds where id = $1 and owner_id = $2 for update",
      [birdId, caller.userId],
    );
    if (!row) throw new AppError("not_found", "Could not find that bird.");
    const bird = toBirdRecord(row);
    const { busyUntil } = bird;
    if (
      bird.status !== "busy" ||
      bird.busyKind !== "nap" ||
      busyUntil === null
    ) {
      throw new AppError("conflict", `${bird.name} is not napping.`);
    }
    const care =
      busyUntil <= now
        ? wakeEffect.nap(careSnapshot(bird), busyUntil, owner)
        : projectCare(careSnapshot(bird), now, owner);
    const [updated] = await db.query<Row<"birds">>(
      `update birds set belly = $2, feathers = $3, energy = $4,
         care_at = to_timestamp($5 / 1000.0), status = 'home',
         busy_kind = null, busy_until = null
       where id = $1 returning *`,
      [birdId, care.belly, care.feathers, care.energy, care.careAtMs],
    );
    return { bird: toBirdView(toBirdRecord(updated), now, owner) };
  });
}
