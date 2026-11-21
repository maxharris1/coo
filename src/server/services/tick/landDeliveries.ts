import { config } from "@/lib/config";
import type { FlightInput, FlightPlan } from "@/lib/flight/engine";
import { distance, duration, type Pronoun } from "@/lib/format";
import { settleFlight } from "@/lib/game/care";
import { deliveryPay } from "@/lib/game/seeds";
import { startOfLocalDayMs, weekStart, weekday } from "@/lib/game/time";
import type { BirdStatus } from "@/lib/game/types";
import type { Db } from "@/server/db";
import type { Deps } from "@/server/deps";
import { badgeRules } from "../badges";
import { landedInTitle, notificationText, recordNotification } from "../notify";
import { deliver } from "../notify/deliver";
import type { Step, StepContext } from "../tick";
import { guestLanding } from "./guestLanding";

type Place = { city: string; region?: string | null; country?: string | null };

type ClaimedDelivery = {
  id: string;
  bird_id: string;
  owner_id: string;
  counterpart_id: string | null;
  guest_link_id: string | null;
  note_id: string | null;
  release_at: Date;
  arrive_at: Date;
  distance_mi: number;
  delay_kind: "none" | "minor" | "major" | null;
  input: FlightInput;
  plan: FlightPlan;
  place_names: { dest?: Place | null };
};

type OwnerRow = {
  name: string;
  timezone: string;
  units: "mi" | "km";
  has_birdbath: boolean;
};

type BirdRow = {
  name: string;
  pronoun: Pronoun;
  gear: string[];
  belly: number;
  feathers: number;
  energy: number;
  care_at: Date;
  last_fed_at: Date;
  hungry_notified: boolean;
  status: BirdStatus;
};

type LandedDelivery = {
  flight: ClaimedDelivery;
  notificationIds: string[];
};

const seeds = config.game.seeds;
const WAIT_MS = config.game.visits.waitMinutes * 60_000;

async function dueIds(ctx: StepContext): Promise<string[]> {
  const found = await ctx.deps.db.query<{ id: string }>(
    `select id from flights
     where kind = 'delivery' and status = 'flying' and arrive_at <= $1
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
  const [flight] = await tx.query<ClaimedDelivery>(
    `update flights set status = 'landed', landed_at = arrive_at
     where id = $1 and kind = 'delivery' and status = 'flying' and arrive_at <= $2
     returning id, bird_id, owner_id, counterpart_id, guest_link_id, note_id,
       release_at, arrive_at, distance_mi, delay_kind, input, plan, place_names`,
    [id, new Date(nowMs).toISOString()],
  );
  return flight ?? null;
}

async function arrivedBefore(tx: Db, f: ClaimedDelivery, dayStartMs: number) {
  const [{ n }] = await tx.query<{ n: number }>(
    `select count(*)::int as n from flights
     where owner_id = $1 and kind = 'delivery' and status in ('flying', 'landed')
       and arrive_at >= $3 and (arrive_at, id) < ($4, $2)`,
    [
      f.owner_id,
      f.id,
      new Date(dayStartMs).toISOString(),
      f.arrive_at.toISOString(),
    ],
  );
  return n;
}

async function postmark(
  tx: Db,
  f: ClaimedDelivery,
  atIso: string,
): Promise<number> {
  const dest = f.place_names.dest;
  if (!dest?.city) return 0;
  const key = [dest.city, dest.region ?? "", dest.country ?? ""]
    .join("|")
    .toLowerCase();
  const inserted = await tx.query(
    `insert into postmarks (user_id, place_key, city, region, country, flight_id, earned_at)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (user_id, place_key) do nothing returning place_key`,
    [
      f.owner_id,
      key,
      dest.city,
      dest.region ?? null,
      dest.country ?? null,
      f.id,
      atIso,
    ],
  );
  if (inserted.length === 0) return 0;
  await tx.query("select apply_seeds($1, $2, 'new_city', $3)", [
    f.owner_id,
    seeds.newCity,
    f.id,
  ]);
  return seeds.newCity;
}

async function punchCard(
  tx: Db,
  f: ClaimedDelivery,
  week: string,
): Promise<number> {
  await tx.query(
    `insert into punch_cards (user_id, week_start, deliveries) values ($1, $2, 1)
     on conflict (user_id, week_start) do update set deliveries = punch_cards.deliveries + 1`,
    [f.owner_id, week],
  );
  const claimed = await tx.query(
    `update punch_cards set paid = true
     where user_id = $1 and week_start = $2 and not paid and deliveries >= $3 returning 1`,
    [f.owner_id, week, seeds.punchCardSize],
  );
  if (claimed.length === 0) return 0;
  await tx.query("select apply_seeds($1, $2, 'punch_card', $3)", [
    f.owner_id,
    seeds.punchCardPay,
    f.id,
  ]);
  return seeds.punchCardPay;
}

async function landOne(
  deps: Deps,
  tx: Db,
  id: string,
): Promise<LandedDelivery | null> {
  const nowMs = deps.clock.now();
  const f = await claim(tx, id, nowMs);
  if (!f) return null;
  const arriveMs = f.arrive_at.getTime();
  const arriveIso = f.arrive_at.toISOString();
  const miles = Number(f.distance_mi ?? f.plan.distanceMi);

  await tx.query(
    "select id from profiles where id = any($1::uuid[]) order by id for update",
    [[f.owner_id, f.counterpart_id].filter((u) => u !== null)],
  );
  const [owner] = await tx.query<OwnerRow>(
    "select name, timezone, units, has_birdbath from profiles where id = $1",
    [f.owner_id],
  );
  const [recipient] = await tx.query<{ name: string }>(
    `select name from profiles where id = $1
     union all select recipient_name from guest_links where id = $2`,
    [f.counterpart_id, f.guest_link_id],
  );

  if (f.note_id)
    await tx.query(
      "update notes set delivered_at = $2 where id = $1 and delivered_at is null",
      [f.note_id, arriveIso],
    );

  const [bird] = await tx.query<BirdRow>(
    `select name, pronoun, gear, belly, feathers, energy, care_at, last_fed_at,
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
    `update birds set miles = miles + $2, deliveries = deliveries + 1,
       detours = detours + $3, belly = $4, feathers = $5, energy = $6,
       care_at = $7, status = 'visiting'
     where id = $1`,
    [
      f.bird_id,
      miles,
      f.delay_kind === "minor" || f.delay_kind === "major" ? 1 : 0,
      care.belly,
      care.feathers,
      care.energy,
      new Date(care.careAtMs).toISOString(),
    ],
  );

  const [visit] = await tx.query<{ id: string }>(
    `insert into visits (flight_id, bird_id, host_id, guest_link_id, note_id, arrived_at, leaves_at)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [
      f.id,
      f.bird_id,
      f.counterpart_id,
      f.guest_link_id,
      f.note_id,
      arriveIso,
      new Date(arriveMs + WAIT_MS).toISOString(),
    ],
  );

  const pay = deliveryPay(
    miles,
    await arrivedBefore(tx, f, startOfLocalDayMs(arriveMs, owner.timezone)),
    {
      partyHat: bird.gear.includes("party"),
      landedLocalWeekday: weekday(arriveMs, owner.timezone),
    },
  );
  await tx.query("select apply_seeds($1, $2, 'delivery', $3)", [
    f.owner_id,
    pay,
    f.id,
  ]);
  const [{ deliveries_count }] = await tx.query<{ deliveries_count: number }>(
    "update profiles set deliveries_count = deliveries_count + 1 where id = $1 returning deliveries_count",
    [f.owner_id],
  );
  await tx.query(
    "update eggs set status = 'ready' where user_id = $1 and status = 'incubating' and hatch_at_delivery <= $2",
    [f.owner_id, deliveries_count],
  );
  const earned =
    pay +
    (await postmark(tx, f, arriveIso)) +
    (await punchCard(tx, f, weekStart(arriveMs, owner.timezone)));

  for (const rule of Object.values(badgeRules))
    await rule.apply(tx, {
      kind: "delivery-landed",
      flightId: f.id,
      ownerId: f.owner_id,
    });

  if (f.counterpart_id)
    await tx.query(
      `insert into bird_meetings (user_id, bird_id, first_at) values ($1, $2, $3)
       on conflict (user_id, bird_id) do nothing`,
      [f.counterpart_id, f.bird_id, arriveIso],
    );

  const vars = { bird: bird.name, flightId: f.id, visitId: visit.id };
  const landedOut = {
    userId: f.owner_id,
    kind: "landed-out" as const,
    refId: f.id,
    vars: {
      ...vars,
      friend: recipient?.name ?? "",
      distance: distance(miles, owner.units),
      duration: duration(arriveMs - f.release_at.getTime()),
      seeds: earned,
    },
  };
  const notices = f.counterpart_id
    ? [
        {
          userId: f.counterpart_id,
          kind: "landed-in" as const,
          refId: visit.id,
          vars: { ...vars, friend: owner.name },
        },
        landedOut,
      ]
    : [landedOut];
  const notificationIds: string[] = [];
  for (const n of notices) {
    const text = notificationText(n.kind, n.vars, bird.pronoun);
    const created = await recordNotification(tx, nowMs, {
      userId: n.userId,
      kind: n.kind,
      refId: n.refId,
      ...text,
      title:
        n.kind === "landed-in"
          ? landedInTitle(text.title, bird.gear)
          : text.title,
    });
    if (created) notificationIds.push(created.id);
  }

  const people = [f.owner_id, f.counterpart_id].filter((u) => u !== null);
  for (const userId of people)
    await tx.query(
      "insert into events (user_id, kind, created_at) values ($1, 'landed', $2)",
      [userId, new Date(nowMs).toISOString()],
    );

  return { flight: f, notificationIds };
}

export const landDeliveries: Step = async (ctx) => {
  const landed: LandedDelivery[] = [];
  for (const id of await dueIds(ctx)) {
    if (ctx.timeUp()) break;
    const out = await ctx.deps.db.tx((tx) => landOne(ctx.deps, tx, id));
    if (out) landed.push(out);
  }
  for (const { notificationIds } of landed)
    for (const n of notificationIds) await deliver(ctx.deps, n);
  await guestLanding(
    ctx,
    landed.filter((l) => l.flight.guest_link_id).map((l) => l.flight),
  );
  return { count: landed.length };
};
