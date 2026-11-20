import { validateOutfit, type GearProblem } from "@/lib/game/gear";
import type { GearId } from "@/lib/game/types";
import type { OnboardedCaller } from "@/server/auth";
import type { Deps } from "@/server/deps";
import { AppError } from "@/server/errors";
import { toBirdRecord, type Row } from "@/server/rows";
import { toBirdView, type BirdView } from "./sync";

export type GearInput = { items: string[] };

type Bird = Row<"birds">;

function isHome(bird: Bird, now: number): boolean {
  if (bird.status === "home") return true;
  return (
    bird.status === "busy" &&
    bird.busy_until !== null &&
    bird.busy_until.getTime() <= now
  );
}

function problemMessage(
  deps: Deps,
  problem: GearProblem,
  birds: readonly Bird[],
): string {
  const name = (id: string) =>
    deps.config.gear.items.find((i) => i.id === id)?.name ?? id;
  switch (problem.kind) {
    case "unknown":
      return "That item is not in the shop.";
    case "duplicate":
      return `${name(problem.item)} is in the list twice.`;
    case "slot_taken":
      return `${name(problem.item)} and ${name(problem.by)} both go on the ${problem.slot}. Pick one.`;
    case "not_owned":
      return `${name(problem.item)} is not in your closet yet.`;
    case "unavailable":
      return `${name(problem.item)} is not available.`;
    case "worn_elsewhere": {
      const wearer = birds.find((b) => b.id === problem.birdId)?.name;
      return `${wearer ?? "Another bird"} is wearing the ${name(problem.item)} and is not home right now.`;
    }
  }
}

export async function putGear(
  deps: Deps,
  caller: OnboardedCaller,
  birdId: string,
  input: GearInput,
): Promise<{ bird: BirdView }> {
  const now = deps.clock.now();
  return deps.db.tx(async (db) => {
    const birds = await db.query<Bird>(
      "select * from birds where owner_id = $1 order by id for update",
      [caller.userId],
    );
    const target = birds.find((b) => b.id === birdId);
    if (!target) throw new AppError("not_found", "Could not find that bird.");
    if (!isHome(target, now)) {
      throw new AppError("conflict", `${target.name} is not home right now.`);
    }

    const owned = await db.query<{ gear_id: GearId }>(
      "select gear_id from gear_owned where user_id = $1",
      [caller.userId],
    );
    const away = birds.filter((b) => b.id !== birdId && !isHome(b, now));
    const result = validateOutfit(
      input.items,
      owned.map((r) => r.gear_id),
      away,
    );
    if (!result.ok) {
      const worn = result.problems.find((p) => p.kind === "worn_elsewhere");
      throw new AppError(
        worn ? "conflict" : "invalid",
        problemMessage(deps, worn ?? result.problems[0], birds),
      );
    }

    await db.query(
      `update birds
       set gear = array(
         select g from unnest(gear) with ordinality as u(g, i)
         where g <> all($3::text[]) order by i
       )
       where owner_id = $1 and id <> $2 and gear && $3::text[]`,
      [caller.userId, birdId, result.items],
    );
    const [row] = await db.query<Bird>(
      "update birds set gear = $2::text[] where id = $1 returning *",
      [birdId, result.items],
    );
    return {
      bird: toBirdView(toBirdRecord(row), now, {
        hasBirdbath: caller.profile.has_birdbath,
      }),
    };
  });
}
