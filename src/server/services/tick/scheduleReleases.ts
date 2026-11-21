import {
  computeFlightPlan,
  hazardsFor,
  interpolate,
  type FlightInput,
  type LatLon,
} from "@/lib/flight/engine";
import { clockTime, type Pronoun } from "@/lib/format";
import { careAt, projectCare, type CareOwner } from "@/lib/game/care";
import { levelFor } from "@/lib/game/levels";
import { isWeekend } from "@/lib/game/time";
import type { Deps } from "@/server/deps";
import { AppError } from "@/server/errors";
import { log } from "@/server/log";
import type { UserId } from "@/server/ports/auth";
import { pair, toBirdRecord, type BirdRecord, type Row } from "@/server/rows";
import {
  LOFT_COLUMNS,
  loftsOf,
  type LoftColumns,
} from "@/server/services/friends";
import { notificationText, recordNotification } from "@/server/services/notify";
import { deliver } from "@/server/services/notify/deliver";
import { sampleWeather } from "@/server/services/weather";
import { placeNames, type PlaceNames } from "../flights/placeNames";
import {
  endpointOf,
  legFor,
  snapshotOf,
  type Endpoint,
} from "../flights/quote";
import type { Step, StepContext } from "../tick";
import { tryRow } from "./rows";

type DueFlight = {
  id: string;
  bird_id: string;
  owner_id: string;
  counterpart_id: string | null;
  release_at: Date;
};

type Leg = { from: Endpoint; to: Endpoint };

type Profile = { name: string; timezone: string; has_birdbath: boolean };

async function dueFlights(ctx: StepContext): Promise<DueFlight[]> {
  return ctx.deps.db.query<DueFlight>(
    `select id, bird_id, owner_id, counterpart_id, release_at
     from flights
     where status = 'scheduled' and release_at <= $1
       and ($2::uuid is null or owner_id = $2 or counterpart_id = $2)
     order by release_at, id limit $3`,
    [
      new Date(ctx.deps.clock.now()).toISOString(),
      ctx.userId ?? null,
      ctx.limit,
    ],
  );
}

async function currentLeg(deps: Deps, f: DueFlight): Promise<Leg | null> {
  if (!f.counterpart_id) return null;
  const [mine] = await deps.db.query<LoftColumns>(
    `select ${LOFT_COLUMNS.join(", ")} from profiles where id = $1`,
    [f.owner_id],
  );
  const myLofts = mine && loftsOf(mine);
  const roost = myLofts && endpointOf("block", myLofts);
  if (!roost) return null;
  try {
    return await legFor(deps, f.owner_id as UserId, myLofts, roost, {
      friendId: f.counterpart_id as UserId,
    });
  } catch (error) {
    if (error instanceof AppError) return null;
    throw error;
  }
}

function toFlightInput(
  flightId: string,
  bird: BirdRecord,
  owner: CareOwner,
  from: LatLon,
  to: LatLon,
  departAtMs: number,
  weather: FlightInput["weather"],
  hazards: FlightInput["hazards"],
): FlightInput {
  const care = careAt(snapshotOf(bird), departAtMs, owner);
  return {
    flightId,
    from,
    to,
    departAtMs,
    bird: {
      speedMph: bird.speedMph,
      focus: bird.focus,
      navigation: bird.navigation,
      breed: bird.breed,
      level: levelFor(bird.miles),
      belly: care.belly,
      feathers: care.feathers,
      energy: care.energy,
      sulking: care.sulking,
    },
    gear: bird.gear,
    weather,
    hazards,
  };
}

async function releaseOne(
  deps: Deps,
  f: DueFlight,
  leg: Leg | null,
  weather: FlightInput["weather"] | null,
  names: PlaceNames | null,
): Promise<{ notificationId: string | null } | null> {
  const releaseMs = f.release_at.getTime();
  const releaseIso = f.release_at.toISOString();

  return deps.db.tx(async (tx) => {
    const now = deps.clock.now();
    await tx.query(
      "select 1 from profiles where id = any($1::uuid[]) order by id for update",
      [[f.owner_id, f.counterpart_id].filter((id) => id !== null)],
    );
    if (f.counterpart_id)
      await tx.query(
        "select 1 from friendships where a_id = $1 and b_id = $2 for share",
        pair(f.owner_id, f.counterpart_id),
      );
    const [locked] = await tx.query<{ counterpart_id: string | null }>(
      "select counterpart_id from flights where id = $1 and status = 'scheduled' for update",
      [f.id],
    );
    if (!locked) return null;
    const current = await currentLeg(
      { ...deps, db: tx },
      { ...f, counterpart_id: locked.counterpart_id },
    );
    if (JSON.stringify(current) !== JSON.stringify(leg))
      throw new Error(`flight ${f.id} endpoints changed before release`);

    if (!current || !weather || !names) {
      await tx.query(
        "update flights set status = 'cancelled' where id = $1 and status = 'scheduled'",
        [f.id],
      );
      await tx.query(
        "update birds set status = 'home' where id = $1 and status = 'scheduled'",
        [f.bird_id],
      );
      await tx.query(
        "insert into events (user_id, kind, created_at) values ($1, 'flight', $2)",
        [f.owner_id, new Date(now).toISOString()],
      );
      return { notificationId: null };
    }
    const counterpartId = locked.counterpart_id as string;
    const from = current.from.point;
    const to = current.to.point;

    const [owner] = await tx.query<Profile>(
      "select name, timezone, has_birdbath from profiles where id = $1",
      [f.owner_id],
    );
    const [them] = await tx.query<{ timezone: string }>(
      "select timezone from profiles where id = $1",
      [counterpartId],
    );
    const [row] = await tx.query<Row<"birds">>(
      "select * from birds where id = $1 for update",
      [f.bird_id],
    );
    const bird = toBirdRecord(row);
    const careOwner: CareOwner = { hasBirdbath: owner.has_birdbath };

    const flight = toFlightInput(
      f.id,
      bird,
      careOwner,
      from,
      to,
      releaseMs,
      weather,
      hazardsFor(releaseMs, from, to, isWeekend(releaseMs, owner.timezone)),
    );
    const plan = computeFlightPlan(flight);

    const care = projectCare(snapshotOf(bird), releaseMs, careOwner);
    const claimed = await tx.query(
      `update birds set status = 'flying', belly = $2, feathers = $3,
         energy = $4, care_at = $5
       where id = $1 and status = 'scheduled' returning id`,
      [bird.id, care.belly, care.feathers, care.energy, releaseIso],
    );
    if (claimed.length === 0)
      throw new Error(`bird ${bird.id} is not scheduled`);

    await tx.query(
      `update flights set status = 'flying', arrive_at = $2, distance_mi = $3,
         odds = $4, delay_kind = $5, input = $6, plan = $7, place_names = $8,
         from_lat = $9, from_lon = $10, from_label = $11,
         to_lat = $12, to_lon = $13, to_label = $14
       where id = $1 and status = 'scheduled'`,
      [
        f.id,
        new Date(plan.arriveAtMs).toISOString(),
        Math.round(plan.distanceMi * 100) / 100,
        plan.onTimeOdds,
        plan.delayKind,
        JSON.stringify(flight),
        JSON.stringify(plan),
        JSON.stringify(names),
        from.lat,
        from.lon,
        current.from.label,
        to.lat,
        to.lon,
        current.to.label,
      ],
    );

    const created = await recordNotification(tx, now, {
      userId: counterpartId,
      kind: "incoming",
      refId: f.id,
      ...notificationText(
        "incoming",
        {
          bird: bird.name,
          fromCity: current.from.label,
          friend: owner.name,
          eta: clockTime(new Date(plan.arriveAtMs), them.timezone),
          flightId: f.id,
        },
        bird.pronoun as Pronoun,
      ),
    });
    await tx.query(
      "insert into events (user_id, kind, created_at) select unnest($1::uuid[]), 'flight', $2",
      [[f.owner_id, counterpartId], new Date(now).toISOString()],
    );
    return { notificationId: created?.id ?? null };
  });
}

async function weatherAndNames(
  deps: Deps,
  { from, to }: Leg,
  releaseMs: number,
): Promise<[FlightInput["weather"], PlaceNames]> {
  const [{ samples }, names] = await Promise.all([
    sampleWeather(
      deps,
      deps.config.game.weather.sampleFractions.map((fraction) => ({
        ...interpolate(from.point, to.point, fraction),
        atMs: releaseMs,
      })),
    ),
    placeNames(deps, from.point, to.point),
  ]);
  return [samples.slice(0, 3) as FlightInput["weather"], names];
}

export const scheduleReleases: Step = async (ctx) => {
  const { deps } = ctx;
  const notificationIds: { flightId: string; id: string }[] = [];
  let count = 0;
  let failed = 0;
  for (const f of await dueFlights(ctx)) {
    if (ctx.timeUp()) break;
    const ok = await tryRow("scheduleReleases", f.id, async () => {
      const leg = await currentLeg(deps, f);
      const [weather, names] = leg
        ? await weatherAndNames(deps, leg, f.release_at.getTime())
        : [null, null];
      const released = await releaseOne(deps, f, leg, weather, names);
      if (!released) return;
      count++;
      if (released.notificationId)
        notificationIds.push({ flightId: f.id, id: released.notificationId });
    });
    if (!ok) failed++;
  }
  for (const n of notificationIds)
    try {
      await deliver(deps, n.id);
    } catch (error) {
      failed++;
      log.error("tick.row_failed", {
        step: "scheduleReleases",
        rowId: n.flightId,
        error,
      });
    }
  return { count, failed };
};
