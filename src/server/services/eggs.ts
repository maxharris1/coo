import { z } from "zod";
import { rollHatchling } from "@/lib/game/eggs";
import type { BreedId } from "@/lib/game/types";
import type { OnboardedCaller } from "@/server/auth";
import type { Db } from "@/server/db";
import type { Deps } from "@/server/deps";
import { AppError } from "@/server/errors";
import { toBirdRecord, type Row } from "@/server/rows";
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
