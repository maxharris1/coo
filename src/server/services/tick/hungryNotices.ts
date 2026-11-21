import type { Pronoun } from "@/lib/format";
import { careAt } from "@/lib/game/care";
import type { Db } from "@/server/db";
import type { Deps } from "@/server/deps";
import { toBirdRecord, type Row } from "@/server/rows";
import { careSnapshot } from "../care/snapshot";
import { notificationText, recordNotification } from "../notify";
import { deliver } from "../notify/deliver";
import type { Step, StepContext } from "../tick";

const HOUR_MS = 3_600_000;

async function dueIds(ctx: StepContext): Promise<string[]> {
  const { bellyPerHour, hungryBelow } = ctx.deps.config.game.care;
  const now = ctx.deps.clock.now();
  const found = await ctx.deps.db.query<{ id: string }>(
    `select id from birds
     where status = 'home' and not hungry_notified
       and belly + $2::float8 * (($1 - extract(epoch from care_at) * 1000) / $3) < $4
       and ($5::uuid is null or owner_id = $5)
     order by care_at limit $6`,
    [now, bellyPerHour, HOUR_MS, hungryBelow, ctx.userId ?? null, ctx.limit],
  );
  return found.map((r) => r.id);
}

async function noticeHungry(
  deps: Deps,
  tx: Db,
  id: string,
): Promise<string | null> {
  const nowMs = deps.clock.now();
  await tx.query(
    `select 1 from profiles where id = (select owner_id from birds where id = $1)
     for key share`,
    [id],
  );
  const [row] = await tx.query<Row<"birds"> & { has_birdbath: boolean }>(
    `select b.*, p.has_birdbath from birds b join profiles p on p.id = b.owner_id
     where b.id = $1 and b.status = 'home' and not b.hungry_notified
     for update of b`,
    [id],
  );
  if (!row) return null;
  const bird = toBirdRecord(row);
  const owner = { hasBirdbath: row.has_birdbath };
  if (!careAt(careSnapshot(bird), nowMs, owner).hungry) return null;
  const [{ ref_id }] = await tx.query<{ ref_id: string }>(
    `update birds set hungry_notified = true where id = $1
     returning md5(id::text || ':hungry:' || last_fed_at::text)::uuid as ref_id`,
    [id],
  );
  const notice = await recordNotification(tx, nowMs, {
    userId: bird.ownerId,
    kind: "hungry",
    refId: ref_id,
    ...notificationText(
      "hungry",
      { bird: bird.name, birdId: id },
      bird.pronoun as Pronoun,
    ),
  });
  return notice?.id ?? null;
}

export const hungryNotices: Step = async (ctx) => {
  const notificationIds: string[] = [];
  for (const id of await dueIds(ctx)) {
    if (ctx.timeUp()) break;
    const created = await ctx.deps.db.tx((tx) =>
      noticeHungry(ctx.deps, tx, id),
    );
    if (created) notificationIds.push(created);
  }
  for (const n of notificationIds) await deliver(ctx.deps, n);
  return { count: notificationIds.length };
};
