import type { FlightPlan, Segment } from "@/lib/flight/engine";
import { clockTime, type Pronoun } from "@/lib/format";
import type { Db } from "@/server/db";
import type { Deps } from "@/server/deps";
import type { PlaceNames } from "../flights/placeNames";
import { notificationText, recordNotification } from "../notify";
import { deliver } from "../notify/deliver";
import type { Step, StepContext } from "../tick";

type ClaimedFlight = {
  owner_id: string;
  bird_id: string;
  from_label: string;
  to_label: string;
  place_names: Partial<PlaceNames>;
  ref_id: string;
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

async function noticeOne(
  deps: Deps,
  tx: Db,
  id: string,
): Promise<string | null> {
  const nowMs = deps.clock.now();
  const [row] = await tx.query<{ plan: FlightPlan }>(
    "select plan from flights where id = $1 and status = 'flying'",
    [id],
  );
  if (!row) return null;
  const nights = nightsStarted(row.plan, nowMs);
  const n = nights.length;
  const [f] = await tx.query<ClaimedFlight>(
    `update flights set roosts_notified = $2
     where id = $1 and status = 'flying' and roosts_notified < $2
     returning owner_id, bird_id, from_label, to_label, place_names,
       md5(id::text || ':roost:' || roosts_notified)::uuid as ref_id`,
    [id, n],
  );
  if (!f) return null;

  const night = nights[n - 1];
  const [bird] = await tx.query<{ name: string; pronoun: Pronoun }>(
    "select name, pronoun from birds where id = $1",
    [f.bird_id],
  );
  const [owner] = await tx.query<{ timezone: string }>(
    "select timezone from profiles where id = $1",
    [f.owner_id],
  );
  const named = f.place_names.deciles?.[Math.round(night.fromFrac * 10)];
  const place = named || (night.fromFrac < 0.5 ? f.from_label : f.to_label);
  const created = await recordNotification(tx, nowMs, {
    userId: f.owner_id,
    kind: "roosting",
    refId: f.ref_id,
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
  return created?.id ?? null;
}

export const roostNotices: Step = async (ctx) => {
  const notificationIds: string[] = [];
  for (const id of await dueIds(ctx)) {
    if (ctx.timeUp()) break;
    const created = await ctx.deps.db.tx((tx) => noticeOne(ctx.deps, tx, id));
    if (created) notificationIds.push(created);
  }
  for (const n of notificationIds) await deliver(ctx.deps, n);
  return { count: notificationIds.length };
};
