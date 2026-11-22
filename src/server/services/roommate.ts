import { nextStarterLook, roommateOwed } from "@/lib/starter";
import type { OnboardedCaller } from "@/server/auth";
import type { Deps } from "@/server/deps";
import { AppError } from "@/server/errors";
import { toBirdRecord, type Row } from "@/server/rows";
import { assertBirdNameFree } from "./birdNames";
import { insertStarterBird } from "./onboarding";
import { toBirdView, type BirdView } from "./sync";

export async function adoptRoommate(
  deps: Deps,
  caller: OnboardedCaller,
  input: { name: string; pronoun: "he" | "she" | "they" },
): Promise<{ bird: BirdView }> {
  const nowMs = deps.clock.now();
  const now = new Date(nowMs).toISOString();
  const { start } = deps.config.game;
  return deps.db.tx(async (db) => {
    const [profile] = await db.query<Row<"profiles">>(
      "select * from profiles where id = $1 for update",
      [caller.userId],
    );
    const birds = await db.query<Row<"birds">>(
      "select * from birds where owner_id = $1 order by hatched_at, id",
      [caller.userId],
    );
    if (birds.length === 0 || birds.length >= start.birds.length) {
      throw new AppError("conflict", "You already have a roommate.");
    }
    if (!roommateOwed(birds.length, profile.perches)) {
      throw new AppError("conflict", "Every perch is taken.");
    }
    await assertBirdNameFree(db, caller.userId, input.name);
    const row = await insertStarterBird(
      db,
      deps.config,
      caller.userId,
      { ...input, look: nextStarterLook(birds[0].look) },
      start.birds[birds.length],
      now,
    );
    return {
      bird: toBirdView(toBirdRecord(row), nowMs, {
        hasBirdbath: profile.has_birdbath,
      }),
    };
  });
}
