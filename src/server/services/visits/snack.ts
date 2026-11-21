import { z } from "zod";
import { config } from "@/lib/config";
import { snack, type CareSnapshot } from "@/lib/game/care";
import { tipFor } from "@/lib/game/seeds";
import type { OnboardedCaller } from "@/server/auth";
import type { Deps } from "@/server/deps";
import { AppError } from "@/server/errors";
import { toBirdRecord, type Row } from "@/server/rows";

const VISIT_ID = z.uuid();
const { snackCost } = config.game.seeds;

type VisitBird = Row<"birds"> & {
  visit_id: string;
  host_id: string | null;
  visit_status: string;
  leaves_at: Date;
  snack_given: boolean;
  owner_has_birdbath: boolean;
};

export async function snackVisit(
  deps: Deps,
  caller: OnboardedCaller,
  visitId: string,
): Promise<{ seeds: number }> {
  const missing = new AppError("not_found", "Could not find that visit.");
  if (!VISIT_ID.safeParse(visitId).success) throw missing;
  const now = deps.clock.now();
  return deps.db.tx(async (db) => {
    const [row] = await db.query<VisitBird>(
      `select b.*, v.id as visit_id, v.host_id, v.status as visit_status, v.leaves_at,
         v.snack_given, o.has_birdbath as owner_has_birdbath
       from visits v
       join birds b on b.id = v.bird_id
       join profiles o on o.id = b.owner_id
       where v.id = $1
       for update of v, b`,
      [visitId],
    );
    if (!row || row.host_id !== caller.userId) throw missing;
    if (row.visit_status !== "waiting" || row.leaves_at.getTime() <= now) {
      throw new AppError("conflict", "The visit is over.");
    }
    if (row.snack_given) throw new AppError("conflict", "Already had a snack.");
    const [host] = await db.query<{ seeds: number }>(
      "select seeds from profiles where id = $1 for update",
      [caller.userId],
    );
    if (host.seeds < snackCost) {
      throw new AppError("insufficient_seeds", "Not enough seeds for a snack.");
    }

    const bird = toBirdRecord(row);
    const [{ apply_seeds: seeds }] = await db.query<{ apply_seeds: number }>(
      "select apply_seeds($1, $2, 'snack', $3)",
      [caller.userId, -snackCost, row.visit_id],
    );
    await db.query("select apply_seeds($1, $2, 'tip', $3)", [
      bird.ownerId,
      tipFor(bird),
      row.visit_id,
    ]);
    const before: CareSnapshot = {
      belly: bird.belly,
      feathers: bird.feathers,
      energy: bird.energy,
      careAtMs: bird.careAt,
      lastFedAtMs: bird.lastFedAt,
      hungryNotified: bird.hungryNotified,
      status: bird.status,
    };
    const care = snack(before, now, { hasBirdbath: row.owner_has_birdbath });
    await db.query(
      `update birds set belly = $2, feathers = $3, energy = $4, care_at = to_timestamp($5 / 1000.0)
       where id = $1`,
      [bird.id, care.belly, care.feathers, care.energy, care.careAtMs],
    );
    await db.query("update visits set snack_given = true where id = $1", [
      row.visit_id,
    ]);
    return { seeds };
  });
}
