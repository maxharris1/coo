import type { Db } from "@/server/db";
import type { Deps } from "@/server/deps";
import { notificationText, recordNotification } from "../notify";
import { deliver } from "../notify/deliver";
import type { Step, StepContext } from "../tick";
import { eachRow, tryRow } from "./rows";

async function dueIds(ctx: StepContext): Promise<string[]> {
  const now = new Date(ctx.deps.clock.now()).toISOString();
  const found = await ctx.deps.db.query<{ id: string }>(
    `select id from guest_links
     where status = 'active' and expires_at <= $1
       and ($2::uuid is null or sender_id = $2)
     order by expires_at limit $3`,
    [now, ctx.userId ?? null, ctx.limit],
  );
  return found.map((r) => r.id);
}

async function expireLink(
  deps: Deps,
  tx: Db,
  id: string,
): Promise<{ id: string; notice: string | null } | null> {
  const nowMs = deps.clock.now();
  const now = new Date(nowMs).toISOString();
  const [link] = await tx.query<{
    sender_id: string;
    recipient_name: string;
    opened_at: Date | null;
  }>(
    `select sender_id, recipient_name, opened_at from guest_links
     where id = $1 and status = 'active' and expires_at <= $2
     for update`,
    [id, now],
  );
  if (!link) return null;
  await tx.query(`update guest_links set status = 'expired' where id = $1`, [
    id,
  ]);
  if (link.opened_at !== null) return { id, notice: null };
  await tx.query(
    `update notes set returned_at = $2
     where guest_link_id = $1 and returned_at is null`,
    [id, now],
  );
  const notice = await recordNotification(tx, nowMs, {
    userId: link.sender_id,
    kind: "link-expired",
    refId: id,
    ...notificationText("link-expired", { name: link.recipient_name }),
  });
  return { id, notice: notice?.id ?? null };
}

export const expireGuestLinks: Step = async (ctx) => {
  const { done, failed } = await eachRow(
    ctx,
    "expireGuestLinks",
    await dueIds(ctx),
    (tx, id) => expireLink(ctx.deps, tx, id),
  );
  let deliverFailed = 0;
  for (const { id, notice } of done)
    if (
      notice &&
      !(await tryRow("expireGuestLinks", id, () => deliver(ctx.deps, notice)))
    )
      deliverFailed++;
  return { count: done.length, failed: failed + deliverFailed };
};
