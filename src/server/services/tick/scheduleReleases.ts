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
import { log } from "@/server/log";
import { toBirdRecord, type BirdRecord, type Row } from "@/server/rows";
import { notificationText, recordNotification } from "@/server/services/notify";
import { deliver } from "@/server/services/notify/deliver";
import { sampleWeather } from "@/server/services/weather";
import { placeNames, type PlaceNames } from "../flights/placeNames";
import { snapshotOf } from "../flights/quote";
import type { Step, StepContext } from "../tick";
import { tryRow } from "./rows";

type DueFlight = {
  id: string;
  bird_id: string;
  owner_id: string;
  counterpart_id: string;
  from_lat: number;
  from_lon: number;
  from_label: string;
  to_lat: number;
  to_lon: number;
  to_label: string;
  release_at: Date;
};

type Profile = { name: string; timezone: string; has_birdbath: boolean };

async function dueFlights(ctx: StepContext): Promise<DueFlight[]> {
  return ctx.deps.db.query<DueFlight>(
    `select id, bird_id, owner_id, counterpart_id, from_lat, from_lon, from_label,
       to_lat, to_lon, to_label, release_at
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
  weather: FlightInput["weather"],
  names: PlaceNames,
): Promise<{ notificationId: string | null } | null> {
  const releaseMs = f.release_at.getTime();
  const releaseIso = f.release_at.toISOString();
  const from = { lat: f.from_lat, lon: f.from_lon };
  const to = { lat: f.to_lat, lon: f.to_lon };

  return deps.db.tx(async (tx) => {
    const now = deps.clock.now();
    const [locked] = await tx.query<{ id: string }>(
      "select id from flights where id = $1 and status = 'scheduled' for update",
      [f.id],
    );
    if (!locked) return null;

    const [owner] = await tx.query<Profile>(
      "select name, timezone, has_birdbath from profiles where id = $1",
      [f.owner_id],
    );
    const [them] = await tx.query<{ timezone: string }>(
      "select timezone from profiles where id = $1",
      [f.counterpart_id],
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
         odds = $4, delay_kind = $5, input = $6, plan = $7, place_names = $8
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
      ],
    );

    const created = await recordNotification(tx, now, {
      userId: f.counterpart_id,
      kind: "incoming",
      refId: f.id,
      ...notificationText(
        "incoming",
        {
          bird: bird.name,
          fromCity: f.from_label,
          friend: owner.name,
          eta: clockTime(new Date(plan.arriveAtMs), them.timezone),
          flightId: f.id,
        },
        bird.pronoun as Pronoun,
      ),
    });
    await tx.query(
      "insert into events (user_id, kind, created_at) select unnest($1::uuid[]), 'flight', $2",
      [[f.owner_id, f.counterpart_id], new Date(now).toISOString()],
    );
    return { notificationId: created?.id ?? null };
  });
}

export const scheduleReleases: Step = async (ctx) => {
  const { deps } = ctx;
  const notificationIds: { flightId: string; id: string }[] = [];
  let count = 0;
  let failed = 0;
  for (const f of await dueFlights(ctx)) {
    if (ctx.timeUp()) break;
    const ok = await tryRow("scheduleReleases", f.id, async () => {
      const releaseMs = f.release_at.getTime();
      const from = { lat: f.from_lat, lon: f.from_lon };
      const to = { lat: f.to_lat, lon: f.to_lon };
      const [{ samples }, names] = await Promise.all([
        sampleWeather(
          deps,
          deps.config.game.weather.sampleFractions.map((fraction) => ({
            ...interpolate(from, to, fraction),
            atMs: releaseMs,
          })),
        ),
        placeNames(deps, from, to),
      ]);
      const weather = samples.slice(0, 3) as FlightInput["weather"];
      const released = await releaseOne(deps, f, weather, names);
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
