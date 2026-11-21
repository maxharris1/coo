import type { Db } from "@/server/db";
import type { Deps } from "@/server/deps";
import { toBirdRecord, type Row } from "@/server/rows";
import { careSnapshot, wakeEffect } from "../care";
import type { Step, StepContext } from "../tick";

async function dueIds(ctx: StepContext): Promise<string[]> {
  const found = await ctx.deps.db.query<{ id: string }>(
    `select id from birds
     where status = 'busy' and busy_kind in ('bath', 'nap')
       and busy_until <= to_timestamp($1 / 1000.0)
       and ($2::uuid is null or owner_id = $2)
     order by busy_until limit $3`,
    [ctx.deps.clock.now(), ctx.userId ?? null, ctx.limit],
  );
  return found.map((r) => r.id);
}

async function wake(deps: Deps, tx: Db, id: string): Promise<boolean> {
  const [row] = await tx.query<Row<"birds"> & { has_birdbath: boolean }>(
    `select b.*, p.has_birdbath from birds b join profiles p on p.id = b.owner_id
     where b.id = $1 and b.status = 'busy' and b.busy_kind in ('bath', 'nap')
       and b.busy_until <= to_timestamp($2 / 1000.0)
     for update of b`,
    [id, deps.clock.now()],
  );
  if (!row) return false;
  const bird = toBirdRecord(row);
  const { busyKind, busyUntil } = bird;
  if (busyUntil === null || (busyKind !== "bath" && busyKind !== "nap")) {
    return false;
  }
  const care = wakeEffect[busyKind](careSnapshot(bird), busyUntil, {
    hasBirdbath: row.has_birdbath,
  });
  await tx.query(
    `update birds set belly = $2, feathers = $3, energy = $4,
       care_at = to_timestamp($5 / 1000.0), status = 'home',
       busy_kind = null, busy_until = null
     where id = $1`,
    [id, care.belly, care.feathers, care.energy, care.careAtMs],
  );
  return true;
}

export const wakeBirds: Step = async (ctx) => {
  let count = 0;
  for (const id of await dueIds(ctx)) {
    if (ctx.timeUp()) break;
    if (await ctx.deps.db.tx((tx) => wake(ctx.deps, tx, id))) count++;
  }
  return { count };
};
