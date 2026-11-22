import { z } from "zod";
import { rollHatchling } from "@/lib/game/eggs";
import type { BreedId } from "@/lib/game/types";
import type { OnboardedCaller } from "@/server/auth";
import type { Db } from "@/server/db";
import type { Deps } from "@/server/deps";
import { AppError } from "@/server/errors";
import { toBirdRecord, type Row } from "@/server/rows";
import { assertBirdNameFree } from "./birdNames";
import { displayName, pronoun } from "./onboarding";
import { toBirdView, type BirdView } from "./sync";

const schema = z.object({
  eggId: z.uuid(),
  name: displayName(24),
  pronoun,
});

type HatchInput = z.infer<typeof schema>;

function parse(input: unknown): HatchInput {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const path = result.error.issues[0].path;
  throw new AppError("invalid", path.length > 0 ? path.join(".") : "body");
}

async function birdById(db: Db, id: string | null): Promise<Row<"birds">> {
  const [row] = await db.query<Row<"birds">>(
    "select * from birds where id = $1",
    [id],
  );
  if (!row) throw new AppError("not_found", "That hatchling has flown off.");
  return row;
}

export async function hatch(
  deps: Deps,
  caller: OnboardedCaller,
  input: unknown,
): Promise<BirdView> {
  const body = parse(input);
  const nowMs = deps.clock.now();
  const now = new Date(nowMs).toISOString();
  const { start, eggs } = deps.config.game;
  return deps.db.tx(async (db) => {
    const [profile] = await db.query<Row<"profiles">>(
      "select * from profiles where id = $1 for update",
      [caller.userId],
    );
    const [egg] = await db.query<Row<"eggs">>(
      "select * from eggs where id = $1 and user_id = $2 for update",
      [body.eggId, caller.userId],
    );
    if (!egg) throw new AppError("not_found", "Could not find that egg.");

    let row: Row<"birds">;
    if (egg.status === "hatched") {
      row = await birdById(db, egg.bird_id);
    } else {
      if (egg.status !== "ready") {
        throw new AppError("conflict", "That egg is not ready to hatch.");
      }
      const birds = await db.query<{ breed: BreedId }>(
        "select breed from birds where owner_id = $1",
        [caller.userId],
      );
      if (birds.length >= profile.perches) {
        throw new AppError("conflict", "Every perch is taken.");
      }
      await assertBirdNameFree(db, caller.userId, body.name);
      const chick = rollHatchling(
        egg.id,
        birds.map((b) => b.breed),
      );
      [row] = await db.query<Row<"birds">>(
        `insert into birds (owner_id, name, breed, look, pronoun, speed_mph, focus, navigation,
           quirks, belly, feathers, energy, care_at, last_fed_at, hatched_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13, $13)
         returning *`,
        [
          caller.userId,
          body.name,
          chick.breed,
          chick.look,
          body.pronoun,
          chick.speedMph,
          chick.focus,
          chick.navigation,
          chick.quirks,
          start.care.belly,
          start.care.feathers,
          start.care.energy,
          now,
        ],
      );
      await db.query(
        "update eggs set status = 'hatched', bird_id = $2, hatched_at = $3 where id = $1",
        [egg.id, row.id, now],
      );
      await db.query(
        "insert into eggs (user_id, hatch_at_delivery, laid_at) values ($1, $2, $3)",
        [caller.userId, profile.deliveries_count + eggs.everyDeliveries, now],
      );
    }
    return toBirdView(toBirdRecord(row), nowMs, {
      hasBirdbath: profile.has_birdbath,
    });
  });
}

export type EggView = {
  id: string;
  status: "incubating" | "ready";
  deliveriesToGo: number;
};

async function openEgg(db: Db, userId: string): Promise<EggView | undefined> {
  const [egg] = await db.query<EggView>(
    `select e.id, e.status,
       greatest(0, e.hatch_at_delivery - p.deliveries_count)::int as "deliveriesToGo"
     from eggs e join profiles p on p.id = e.user_id
     where e.user_id = $1 and e.status <> 'hatched'`,
    [userId],
  );
  return egg;
}

export async function hatchOpenEgg(
  deps: Deps,
  caller: OnboardedCaller,
  input: { name: string; pronoun: string },
): Promise<{ bird: BirdView; egg: EggView | null }> {
  const egg = await openEgg(deps.db, caller.userId);
  if (!egg) throw new AppError("conflict", "That egg is not ready to hatch.");
  const bird = await hatch(deps, caller, { ...input, eggId: egg.id });
  return { bird, egg: (await openEgg(deps.db, caller.userId)) ?? null };
}

export type Aviary = {
  perches: {
    total: number;
    free: number;
    birds: { id: string; name: string; breed: BreedId; look: string }[];
  };
  egg: {
    id: string;
    status: "incubating" | "ready";
    deliveriesToGo: number;
    waitingForPerch: boolean;
  } | null;
  breeds: {
    id: BreedId;
    name: string;
    note: string;
    trait: string;
    hatchable: boolean;
    owned: boolean;
  }[];
};

export async function aviary(
  deps: Deps,
  caller: OnboardedCaller,
): Promise<Aviary> {
  const id = caller.userId;
  const [[profile], birds, [egg]] = await Promise.all([
    deps.db.query<Pick<Row<"profiles">, "perches" | "deliveries_count">>(
      "select perches, deliveries_count from profiles where id = $1",
      [id],
    ),
    deps.db.query<Aviary["perches"]["birds"][number]>(
      "select id, name, breed, look from birds where owner_id = $1 order by hatched_at, id",
      [id],
    ),
    deps.db.query<{
      id: string;
      status: "incubating" | "ready";
      hatch_at_delivery: number;
    }>(
      "select id, status, hatch_at_delivery from eggs where user_id = $1 and status <> 'hatched'",
      [id],
    ),
  ]);
  const free = Math.max(0, profile.perches - birds.length);
  const owned = new Set(birds.map((b) => b.breed));
  return {
    perches: { total: profile.perches, free, birds },
    egg: egg
      ? {
          id: egg.id,
          status: egg.status,
          deliveriesToGo: Math.max(
            0,
            egg.hatch_at_delivery - profile.deliveries_count,
          ),
          waitingForPerch: egg.status === "ready" && free === 0,
        }
      : null,
    breeds: deps.config.breeds.breeds.map((b) => {
      const breed = b.id as BreedId;
      return {
        id: breed,
        name: b.name,
        note: b.note,
        trait: b.trait,
        hatchable: b.hatchable,
        owned: owned.has(breed),
      };
    }),
  };
}
