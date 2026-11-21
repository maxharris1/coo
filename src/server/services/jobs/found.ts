import type { OnboardedCaller } from "@/server/auth";
import type { Deps } from "@/server/deps";

export type FoundItem = {
  id: string;
  objectId: string;
  name: string;
  value: number;
  birdId: string | null;
};

export async function foundObjects(
  deps: Deps,
  caller: OnboardedCaller,
): Promise<FoundItem[]> {
  const rows = await deps.db.query<{
    id: string;
    object_id: string;
    value: number;
    bird_id: string | null;
  }>(
    `select id, object_id, value, bird_id from found_objects
     where user_id = $1 and traded_at is null
     order by found_at, id`,
    [caller.userId],
  );
  const names = new Map(
    deps.config.foundObjects.objects.map((o) => [o.id, o.name]),
  );
  return rows.map((r) => ({
    id: r.id,
    objectId: r.object_id,
    name: names.get(r.object_id) ?? r.object_id,
    value: r.value,
    birdId: r.bird_id,
  }));
}

export async function tradeFound(
  deps: Deps,
  caller: OnboardedCaller,
): Promise<{ seeds: number; traded: number }> {
  return deps.db.tx(async (tx) => {
    const [profile] = await tx.query<{ seeds: number }>(
      "select seeds from profiles where id = $1 for update",
      [caller.userId],
    );
    const traded = (
      await tx.query<{ value: number }>(
        `update found_objects set traded_at = $2
         where user_id = $1 and traded_at is null returning value`,
        [caller.userId, new Date(deps.clock.now()).toISOString()],
      )
    ).reduce((sum, r) => sum + r.value, 0);
    if (traded === 0) return { seeds: profile.seeds, traded };
    const [{ seeds }] = await tx.query<{ seeds: number }>(
      "select apply_seeds($1, $2, 'trade', null) as seeds",
      [caller.userId, traded],
    );
    return { seeds, traded };
  });
}
