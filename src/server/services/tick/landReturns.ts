import { config } from "@/lib/config";
import type { FlightInput, FlightPlan } from "@/lib/flight/engine";
import type { Pronoun } from "@/lib/format";
import { settleFlight } from "@/lib/game/care";
import { foundObjectFor } from "@/lib/game/jobs";
import type { BirdStatus } from "@/lib/game/types";
import type { Db } from "@/server/db";
import type { Deps } from "@/server/deps";
import { badgeRules } from "../badges";
import {
  notificationText,
  recordNotification,
  type NotifyKind,
} from "../notify";
import { deliver } from "../notify/deliver";
import type { Step, StepContext } from "../tick";

type ClaimedReturn = {
  id: string;
  bird_id: string;
  owner_id: string;
  counterpart_id: string | null;
  note_id: string | null;
  arrive_at: Date;
  distance_mi: number;
  input: FlightInput;
  plan: FlightPlan;
};

type BirdRow = {
  name: string;
  pronoun: Pronoun;
  belly: number;
  feathers: number;
  energy: number;
  care_at: Date;
  last_fed_at: Date;
  hungry_notified: boolean;
  status: BirdStatus;
};

type Notice = {
  userId: string;
  kind: NotifyKind;
  vars: Record<string, string>;
};

async function dueIds(ctx: StepContext): Promise<string[]> {
  const found = await ctx.deps.db.query<{ id: string }>(
    `select id from flights
     where kind = 'return' and status = 'flying' and arrive_at <= $1
       and ($2::uuid is null or owner_id = $2 or counterpart_id = $2)
     order by arrive_at limit $3`,
    [
      new Date(ctx.deps.clock.now()).toISOString(),
      ctx.userId ?? null,
      ctx.limit,
    ],
  );
  return found.map((r) => r.id);
}

async function claim(tx: Db, id: string, nowMs: number) {
  const [flight] = await tx.query<ClaimedReturn>(
    `update flights set status = 'landed', landed_at = arrive_at
     where id = $1 and kind = 'return' and status = 'flying' and arrive_at <= $2
     returning id, bird_id, owner_id, counterpart_id, note_id, arrive_at,
       distance_mi, input, plan`,
    [id, new Date(nowMs).toISOString()],
  );
  return flight ?? null;
}

async function landOne(
  deps: Deps,
  tx: Db,
  id: string,
): Promise<string[] | null> {
  const nowMs = deps.clock.now();
  const f = await claim(tx, id, nowMs);
  if (!f) return null;
  const arriveIso = f.arrive_at.toISOString();

  const people = [f.owner_id, f.counterpart_id].filter((u) => u !== null);
  const profiles = new Map(
    (
      await tx.query<{ id: string; name: string; has_birdbath: boolean }>(
        `select id, name, has_birdbath from profiles
         where id = any($1::uuid[]) order by id for update`,
        [people],
      )
    ).map((p) => [p.id, p]),
  );
  const owner = profiles.get(f.owner_id)!;

  const [bird] = await tx.query<BirdRow>(
    `select name, pronoun, belly, feathers, energy, care_at, last_fed_at,
       hungry_notified, status
     from birds where id = $1 for update`,
    [f.bird_id],
  );
  const care = settleFlight(
    {
      belly: Number(bird.belly),
      feathers: Number(bird.feathers),
      energy: Number(bird.energy),
      careAtMs: bird.care_at.getTime(),
      lastFedAtMs: bird.last_fed_at.getTime(),
      hungryNotified: bird.hungry_notified,
      status: bird.status,
    },
    f.plan,
    f.input,
    { hasBirdbath: owner.has_birdbath },
  );
  await tx.query(
    `update birds set miles = miles + $2, belly = $3, feathers = $4, energy = $5,
       care_at = $6, status = 'home'
     where id = $1`,
    [
      f.bird_id,
      Number(f.distance_mi ?? f.plan.distanceMi),
      care.belly,
      care.feathers,
      care.energy,
      new Date(care.careAtMs).toISOString(),
    ],
  );

  const replier = f.counterpart_id ? profiles.get(f.counterpart_id) : undefined;
  const notices: Notice[] = [];
  if (f.note_id) {
    await tx.query(
      "update notes set delivered_at = $2 where id = $1 and delivered_at is null",
      [f.note_id, arriveIso],
    );
    await tx.query("select apply_seeds($1, $2, 'reply_home', $3)", [
      f.owner_id,
      config.game.seeds.replyHome,
      f.id,
    ]);
    for (const rule of Object.values(badgeRules))
      await rule.apply(tx, {
        kind: "return-landed",
        flightId: f.id,
        ownerId: f.owner_id,
      });
    notices.push({
      userId: f.owner_id,
      kind: "reply-home",
      vars: { friend: replier?.name ?? "", friendId: f.counterpart_id ?? "" },
    });
    if (replier)
      notices.push({
        userId: replier.id,
        kind: "reply-delivered",
        vars: { friend: owner.name, friendId: f.owner_id },
      });
  } else {
    notices.push({ userId: f.owner_id, kind: "home-empty", vars: {} });
  }

  const found = foundObjectFor(f.id, config.game.foundOnReturn.chance);
  if (found)
    await tx.query(
      `insert into found_objects (user_id, bird_id, object_id, value, source_id, found_at)
       values ($1, $2, $3, $4, $5, $6) on conflict (source_id) do nothing`,
      [f.owner_id, f.bird_id, found.id, found.value, f.id, arriveIso],
    );

  const notificationIds: string[] = [];
  for (const n of notices) {
    const created = await recordNotification(tx, nowMs, {
      userId: n.userId,
      kind: n.kind,
      refId: f.id,
      ...notificationText(
        n.kind,
        { bird: bird.name, flightId: f.id, ...n.vars },
        bird.pronoun,
      ),
    });
    if (created) notificationIds.push(created.id);
  }

  for (const userId of people)
    await tx.query(
      "insert into events (user_id, kind, created_at) values ($1, 'landed', $2)",
      [userId, new Date(nowMs).toISOString()],
    );

  return notificationIds;
}

export const landReturns: Step = async (ctx) => {
  const landed: string[][] = [];
  for (const id of await dueIds(ctx)) {
    if (ctx.timeUp()) break;
    const out = await ctx.deps.db.tx((tx) => landOne(ctx.deps, tx, id));
    if (out) landed.push(out);
  }
  for (const n of landed.flat()) await deliver(ctx.deps, n);
  return { count: landed.length };
};
