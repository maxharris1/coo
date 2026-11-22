import { validateOutfit, type GearProblem } from "@/lib/game/gear";
import { gearIds, type GearId } from "@/lib/game/types";
import type { OnboardedCaller } from "@/server/auth";
import type { Db } from "@/server/db";
import type { Deps } from "@/server/deps";
import { AppError } from "@/server/errors";
import { toBirdRecord, toOutfit, type Outfit, type Row } from "@/server/rows";
import { toBirdView, type BirdView } from "./sync";

export type GearInput = { items: string[] } | { outfitId: string };

export type OutfitsInput = {
  outfits: { id?: string; name: string; items: string[] }[];
};

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

async function pickFromOutfit(
  db: Db,
  userId: string,
  outfitId: string,
  closet: readonly GearId[],
  away: readonly Bird[],
): Promise<{ items: string[]; skipped: string[] }> {
  const [outfit] = await db.query<Row<"outfits">>(
    "select * from outfits where id = $1 and user_id = $2",
    [outfitId, userId],
  );
  if (!outfit) throw new AppError("not_found", "Could not find that outfit.");
  const items: string[] = [];
  const skipped: string[] = [];
  for (const item of new Set(outfit.items)) {
    if (validateOutfit([...items, item], closet, away).ok) items.push(item);
    else skipped.push(item);
  }
  return { items, skipped };
}

export async function putGear(
  deps: Deps,
  caller: OnboardedCaller,
  birdId: string,
  input: GearInput,
): Promise<{ bird: BirdView; skipped: string[] }> {
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
    const closet = owned.map((r) => r.gear_id);
    const away = birds.filter((b) => b.id !== birdId && !isHome(b, now));
    const { items, skipped } =
      "outfitId" in input
        ? await pickFromOutfit(db, caller.userId, input.outfitId, closet, away)
        : { items: input.items, skipped: [] };
    const result = validateOutfit(items, closet, away);
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
      skipped,
    };
  });
}

const SHAPE_PROBLEMS = new Set<GearProblem["kind"]>([
  "unknown",
  "duplicate",
  "slot_taken",
]);

export async function saveOutfits(
  deps: Deps,
  caller: OnboardedCaller,
  input: OutfitsInput,
): Promise<{ outfits: Outfit[] }> {
  const max = deps.config.game.limits.outfitsMax;
  if (input.outfits.length > max) {
    throw new AppError("invalid", `Save at most ${max} outfits.`);
  }
  const wanted = input.outfits.map((o) => ({ ...o, id: o.id?.toLowerCase() }));
  const ids = wanted.flatMap((o) => (o.id ? [o.id] : []));
  if (new Set(ids).size !== ids.length) {
    throw new AppError("invalid", "An outfit is in the list twice.");
  }
  for (const { items } of wanted) {
    const result = validateOutfit(items, gearIds, []);
    const problem = result.ok
      ? undefined
      : result.problems.find((p) => SHAPE_PROBLEMS.has(p.kind));
    if (problem)
      throw new AppError("invalid", problemMessage(deps, problem, []));
  }

  return deps.db.tx(async (db) => {
    await db.query("select 1 from profiles where id = $1 for update", [
      caller.userId,
    ]);
    const unclaimed = (
      await db.query<Row<"outfits">>(
        "select * from outfits where user_id = $1 order by position, id",
        [caller.userId],
      )
    ).filter((row) => !ids.includes(row.id));
    const rows: Row<"outfits">[] = [];
    for (const [position, { id, name, items }] of wanted.entries()) {
      const same = id
        ? -1
        : unclaimed.findIndex(
            (row) =>
              row.name === name &&
              row.items.length === items.length &&
              row.items.every((item, i) => item === items[i]),
          );
      const reuse = same === -1 ? id : unclaimed.splice(same, 1)[0].id;
      const [row] = await db.query<Row<"outfits">>(
        `insert into outfits (id, user_id, name, items, position)
         values (coalesce($1::uuid, gen_random_uuid()), $2, $3, $4, $5)
         on conflict (id) do update
           set name = excluded.name, items = excluded.items, position = excluded.position
           where outfits.user_id = excluded.user_id
         returning *`,
        [reuse ?? null, caller.userId, name, items, position],
      );
      if (!row) throw new AppError("not_found", "Could not find that outfit.");
      rows.push(row);
    }
    await db.query(
      "delete from outfits where user_id = $1 and id <> all($2::uuid[])",
      [caller.userId, rows.map((r) => r.id)],
    );
    return { outfits: rows.map(toOutfit) };
  });
}
