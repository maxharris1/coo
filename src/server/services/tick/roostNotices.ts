import type { FlightPlan, Segment } from "@/lib/flight/engine";
import { clockTime, type Pronoun } from "@/lib/format";
import type { Db } from "@/server/db";
import type { Deps } from "@/server/deps";
import type { PlaceNames } from "../flights/placeNames";
import { notificationText, recordNotification } from "../notify";
import { deliver } from "../notify/deliver";
import type { Step, StepContext } from "../tick";
import { eachRow, tryRow } from "./rows";

type ClaimedFlight = {
  owner_id: string;
  bird_id: string;
  from_label: string;
  to_label: string;
  place_names: Partial<PlaceNames>;
};

function nightsStarted(plan: FlightPlan, nowMs: number): Segment[] {
  const firstFly = plan.segments.findIndex((s) => s.kind === "fly");
  if (firstFly === -1) return [];
  return plan.segments
    .slice(firstFly + 1)
    .filter((s) => s.kind === "roost" && s.startMs <= nowMs);
}

async function dueIds(ctx: StepContext): Promise<string[]> {
  const found = await ctx.deps.db.query<{ id: string }>(
    `select id from flights f
     where status = 'flying'
       and ($2::uuid is null or owner_id = $2 or counterpart_id = $2)
       and roosts_notified < (
         select count(*) from jsonb_array_elements(f.plan->'segments') s
         where s->>'kind' = 'roost' and (s->>'fromFrac')::float8 > 0
           and (s->>'startMs')::float8 <= $1
       )
     order by arrive_at limit $3`,
    [ctx.deps.clock.now(), ctx.userId ?? null, ctx.limit],
  );
  return found.map((r) => r.id);
}

async function noticeNights(deps: Deps, tx: Db, id: string): Promise<string[]> {
  const nowMs = deps.clock.now();
  const [row] = await tx.query<{ plan: FlightPlan; roosts_notified: number }>(
    "select plan, roosts_notified from flights where id = $1 and status = 'flying' for update",
    [id],
  );
  if (!row) return [];
  const nights = nightsStarted(row.plan, nowMs);
  const unnotified = nights.slice(row.roosts_notified);
  if (unnotified.length === 0) return [];
  const [f] = await tx.query<ClaimedFlight>(
    `update flights set roosts_notified = $2 where id = $1
     returning owner_id, bird_id, from_label, to_label, place_names`,
    [id, nights.length],
  );
  const refs = await tx.query<{ ref_id: string }>(
    `select md5($1::text || ':roost:' || k)::uuid as ref_id
     from generate_series($2::int + 1, $3::int) k order by k`,
    [id, row.roosts_notified, nights.length],
  );
  const [bird] = await tx.query<{ name: string; pronoun: Pronoun }>(
    "select name, pronoun from birds where id = $1",
    [f.bird_id],
  );
  const [owner] = await tx.query<{ timezone: string }>(
    "select timezone from profiles where id = $1",
    [f.owner_id],
  );
  const created: string[] = [];
  for (const [i, night] of unnotified.entries()) {
    const named = f.place_names.deciles?.[Math.round(night.fromFrac * 10)];
    const place = named || (night.fromFrac < 0.5 ? f.from_label : f.to_label);
    const notice = await recordNotification(tx, nowMs, {
      userId: f.owner_id,
      kind: "roosting",
      refId: refs[i].ref_id,
      ...notificationText(
        "roosting",
        {
          bird: bird.name,
          flightId: id,
          place,
          sunrise: clockTime(new Date(night.endMs), owner.timezone),
        },
        bird.pronoun,
      ),
    });
    if (notice) created.push(notice.id);
  }
  return created;
}

export const roostNotices: Step = async (ctx) => {
  const { done, failed } = await eachRow(
    ctx,
    "roostNotices",
    await dueIds(ctx),
    async (tx, id) => ({ id, notices: await noticeNights(ctx.deps, tx, id) }),
  );
  let count = 0;
  let deliverFailed = 0;
  for (const { id, notices } of done)
    for (const n of notices) {
      count++;
      if (!(await tryRow("roostNotices", id, () => deliver(ctx.deps, n))))
        deliverFailed++;
    }
  return { count, failed: failed + deliverFailed };
};
