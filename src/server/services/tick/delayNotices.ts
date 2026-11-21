import type { FlightPlan, Segment } from "@/lib/flight/engine";
import type { Pronoun } from "@/lib/format";
import type { Db } from "@/server/db";
import {
  type NotifyKind,
  notificationText,
  recordNotification,
} from "../notify";
import { deliver } from "../notify/deliver";
import type { Step, StepContext } from "../tick";
import { tryRow } from "./rows";

type Candidate = {
  id: string;
  owner_id: string;
  counterpart_id: string | null;
  bird_id: string;
  from_label: string;
  plan: FlightPlan;
  place_names: { deciles?: (string | null)[] };
};

async function candidates(
  ctx: StepContext,
  nowMs: number,
): Promise<Candidate[]> {
  return ctx.deps.db.query<Candidate>(
    `select id, owner_id, counterpart_id, bird_id, from_label, plan, place_names
     from flights
     where status = 'flying' and delay_kind = 'major'
       and (not delay_notified or (counterpart_id is not null and not exists (
         select 1 from notifications n
         where n.user_id = flights.counterpart_id and n.kind = 'delayed-in'
           and n.ref_id = flights.id
       )))
       and ($1::uuid is null or owner_id = $1 or counterpart_id = $1)
       and exists (
         select 1 from jsonb_array_elements(plan->'segments') s
         where s->>'kind' = 'delay' and (s->>'startMs')::bigint <= $3
       )
     order by release_at limit $2`,
    [ctx.userId ?? null, ctx.limit, nowMs],
  );
}

function lastSeen(f: Candidate, delay: Segment): string {
  const deciles = f.place_names.deciles ?? [];
  const at = Math.round(delay.fromFrac * 10);
  for (let d = 0; d < deciles.length; d++) {
    const place = deciles[at - d] ?? deciles[at + d];
    if (place) return `near ${place}`;
  }
  return `near ${f.from_label}`;
}

async function notifyOne(
  tx: Db,
  nowMs: number,
  f: Candidate,
  delay: Segment,
): Promise<string[]> {
  const [flight] = await tx.query<{ delay_notified: boolean }>(
    "select delay_notified from flights where id = $1 and status = 'flying' for update",
    [f.id],
  );
  if (!flight) return [];
  if (!flight.delay_notified)
    await tx.query("update flights set delay_notified = true where id = $1", [
      f.id,
    ]);
  const [bird] = await tx.query<{ name: string; pronoun: Pronoun }>(
    "select name, pronoun from birds where id = $1",
    [f.bird_id],
  );
  const [owner] = await tx.query<{ name: string }>(
    "select name from profiles where id = $1",
    [f.owner_id],
  );
  const vars = { bird: bird.name, flightId: f.id };
  const notices: {
    userId: string;
    kind: NotifyKind;
    vars: Record<string, string>;
  }[] = [];
  if (!flight.delay_notified)
    notices.push({
      userId: f.owner_id,
      kind: "delayed",
      vars: { ...vars, lastSeen: lastSeen(f, delay) },
    });
  if (f.counterpart_id)
    notices.push({
      userId: f.counterpart_id,
      kind: "delayed-in",
      vars: { ...vars, friend: owner.name },
    });
  const ids: string[] = [];
  for (const n of notices) {
    const created = await recordNotification(tx, nowMs, {
      userId: n.userId,
      kind: n.kind,
      refId: f.id,
      ...notificationText(n.kind, n.vars, bird.pronoun),
    });
    if (created) ids.push(created.id);
  }
  return ids;
}

export const delayNotices: Step = async (ctx) => {
  const nowMs = ctx.deps.clock.now();
  const notified: { flightId: string; ids: string[] }[] = [];
  let failed = 0;
  for (const f of await candidates(ctx, nowMs)) {
    if (ctx.timeUp()) break;
    const delay = f.plan.segments.find(
      (s) => s.kind === "delay" && s.startMs <= nowMs,
    );
    if (!delay) continue;
    const ok = await tryRow("delayNotices", f.id, async () => {
      const ids = await ctx.deps.db.tx((tx) => notifyOne(tx, nowMs, f, delay));
      if (ids.length > 0) notified.push({ flightId: f.id, ids });
    });
    if (!ok) failed++;
  }
  for (const { flightId, ids } of notified)
    for (const id of ids)
      if (
        !(await tryRow("delayNotices", flightId, () => deliver(ctx.deps, id)))
      )
        failed++;
  return failed
    ? { count: notified.length, failed }
    : { count: notified.length };
};
