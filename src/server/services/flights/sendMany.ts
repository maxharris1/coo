import { randomUUID } from "node:crypto";
import {
  computeFlightPlan,
  hazardsFor,
  interpolate,
  type FlightInput,
  type WeatherSample,
} from "@/lib/flight/engine";
import { clockTime, type Pronoun } from "@/lib/format";
import { careAt, projectCare, type CareOwner } from "@/lib/game/care";
import { levelFor } from "@/lib/game/levels";
import type { Note } from "@/lib/game/notes";
import {
  isWeekend,
  startOfLocalDayMs,
  startOfNextLocalDayMs,
} from "@/lib/game/time";
import type { Db } from "@/server/db";
import type { Deps } from "@/server/deps";
import { AppError } from "@/server/errors";
import { log } from "@/server/log";
import type { UserId } from "@/server/ports/auth";
import { toBirdRecord, type BirdRecord, type Row } from "@/server/rows";
import {
  LOFT_COLUMNS,
  loftsOf,
  type LoftColumns,
} from "@/server/services/friends";
import {
  doodleParam,
  readyNote,
  type NoteInput,
} from "@/server/services/noteInput";
import { notificationText, recordNotification } from "@/server/services/notify";
import { deliver } from "@/server/services/notify/deliver";
import { sampleWeather } from "@/server/services/weather";
import { getFlight } from "./get";
import { placeNames } from "./placeNames";
import { endpointOf, legFor, snapshotOf, type Endpoint } from "./quote";
import type { SendHook, SendItem } from "./send";

type FriendSend = { friendId: UserId; birdId: string };

type Me = LoftColumns &
  Pick<Row<"profiles">, "has_birdbath" | "timezone" | "name">;

type Route = { from: Endpoint; to: Endpoint };

export const sendMany: SendHook = async (deps, me, input) => {
  const items = checkBatch(
    input.sends,
    deps.config.game.limits.recipientsPerSend,
  );
  const friends = items.map((i) => i.friendId);
  const birdIds = items.map((i) => i.birdId);

  const { mine, routes } = await routesFor(deps, me, friends);
  const owner: CareOwner = { hasBirdbath: mine.has_birdbath };
  const now = deps.clock.now();
  readyBirds(
    await birdsOf(deps.db, me, birdIds, false),
    birdIds,
    input,
    now,
    owner,
  );

  const legs = await Promise.all(
    routes.map(async ({ from, to }, i) => {
      const [{ samples }, names, [them]] = await Promise.all([
        sampleWeather(
          deps,
          deps.config.game.weather.sampleFractions.map((f) => ({
            ...interpolate(from.point, to.point, f),
            atMs: now,
          })),
        ),
        placeNames(deps, from.point, to.point),
        deps.db.query<{ timezone: string }>(
          "select timezone from profiles where id = $1",
          [friends[i]],
        ),
      ]);
      return {
        flightId: randomUUID(),
        weather: samples.slice(0, 3) as FlightInput["weather"],
        hazards: hazardsFor(
          now,
          from.point,
          to.point,
          isWeekend(now, mine.timezone),
        ),
        names,
        timezone: them.timezone,
      };
    }),
  );
  const nowIso = new Date(now).toISOString();

  const { notifications, flights } = await deps.db.tx(async (tx) => {
    await tx.query(
      "select 1 from profiles where id = any($1::uuid[]) order by id for update",
      [[me, ...friends]],
    );
    await tx.query(
      `select 1 from friendships
       where (a_id = $1 and b_id = any($2::uuid[])) or (b_id = $1 and a_id = any($2::uuid[]))
       order by a_id, b_id for share`,
      [me, friends],
    );
    const current = await routesFor({ ...deps, db: tx }, me, friends);
    if (JSON.stringify(current.routes) !== JSON.stringify(routes))
      throw new AppError("forbidden", "Your friend changed what they share");
    const ready = readyBirds(
      await birdsOf(tx, me, birdIds, true),
      birdIds,
      input,
      now,
      owner,
    );

    const [{ count: sentToday }] = await tx.query<{ count: number }>(
      `select count(*)::int from flights
       where owner_id = $1 and kind = 'delivery' and status <> 'cancelled'
         and created_at >= $2 and created_at < $3`,
      [
        me,
        new Date(startOfLocalDayMs(now, current.mine.timezone)).toISOString(),
        new Date(
          startOfNextLocalDayMs(now, current.mine.timezone),
        ).toISOString(),
      ],
    );
    if (sentToday + items.length > deps.config.game.limits.flightsPerDay)
      throw new AppError("rate_limited", "Too many requests. Try again later.");

    const created = [];
    for (const [i, { bird, note }] of ready.entries()) {
      const friend = friends[i];
      const { from, to } = routes[i];
      const { flightId, weather, hazards, names, timezone } = legs[i];
      const flightInput = toFlightInput(
        flightId,
        bird,
        owner,
        from,
        to,
        now,
        weather,
        hazards,
      );
      const plan = computeFlightPlan(flightInput);

      const care = projectCare(snapshotOf(bird), now, owner);
      const claimed = await tx.query(
        `update birds set status = 'flying', belly = $3, feathers = $4,
           energy = $5, care_at = $6
         where id = $1 and owner_id = $2 and status = 'home' returning id`,
        [bird.id, me, care.belly, care.feathers, care.energy, nowIso],
      );
      if (claimed.length === 0)
        throw new AppError("conflict", `${bird.name} is not home`);

      const [noteRow] = await tx.query<{ id: string }>(
        `insert into notes (sender_id, recipient_id, body, doodle, created_at)
         values ($1, $2, $3, $4::jsonb, $5) returning id`,
        [me, friend, note.body, doodleParam(note), nowIso],
      );
      await tx.query(
        `insert into flights (id, kind, bird_id, owner_id, counterpart_id, note_id,
           from_lat, from_lon, from_label, to_lat, to_lon, to_label, status,
           release_at, arrive_at, distance_mi, odds, delay_kind, input, plan,
           place_names, created_at)
         values ($1, 'delivery', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
           'flying', $12, $13, $14, $15, $16, $17, $18, $19, $12)`,
        [
          flightId,
          bird.id,
          me,
          friend,
          noteRow.id,
          from.point.lat,
          from.point.lon,
          from.label,
          to.point.lat,
          to.point.lon,
          to.label,
          nowIso,
          new Date(plan.arriveAtMs).toISOString(),
          Math.round(plan.distanceMi * 100) / 100,
          plan.onTimeOdds,
          plan.delayKind,
          JSON.stringify(flightInput),
          JSON.stringify(plan),
          JSON.stringify(names),
        ],
      );
      const notification = await recordNotification(tx, now, {
        userId: friend,
        kind: "incoming",
        refId: flightId,
        ...notificationText(
          "incoming",
          {
            bird: bird.name,
            fromCity: from.label,
            friend: mine.name,
            eta: clockTime(new Date(plan.arriveAtMs), timezone),
            flightId,
          },
          bird.pronoun as Pronoun,
        ),
      });
      created.push({ flightId, notification });
    }
    await tx.query(
      "insert into events (user_id, kind, created_at) select unnest($1::uuid[]), 'flight', $2",
      [[me, ...friends], nowIso],
    );
    const flights = [];
    for (const { flightId } of created)
      flights.push(await getFlight({ ...deps, db: tx }, me, flightId));
    return { notifications: created, flights };
  });

  for (const { notification, flightId } of notifications)
    if (notification) await deliverQuietly(deps, notification.id, flightId);
  return { flights };
};

function checkBatch(sends: SendItem[], max: number): FriendSend[] {
  if (sends.length > max)
    throw new AppError("invalid", `sends: up to ${max} friends at once`);
  const items = sends.map((s) => {
    if ("guest" in s)
      throw new AppError("invalid", "sends: send to someone new on its own");
    return {
      friendId: s.friendId.toLowerCase() as UserId,
      birdId: s.birdId.toLowerCase(),
    };
  });
  if (new Set(items.map((i) => i.birdId)).size < items.length)
    throw new AppError("invalid", "sends: one bird per friend");
  if (new Set(items.map((i) => i.friendId)).size < items.length)
    throw new AppError("invalid", "sends: each friend once");
  return items;
}

async function routesFor(
  deps: Deps,
  me: UserId,
  friends: UserId[],
): Promise<{ mine: Me; routes: Route[] }> {
  const [mine] = await deps.db.query<Me>(
    `select ${LOFT_COLUMNS.join(", ")}, has_birdbath, timezone, name
     from profiles where id = $1`,
    [me],
  );
  const myLofts = mine && loftsOf(mine);
  const roost = myLofts && endpointOf("block", myLofts);
  if (!roost) throw new AppError("conflict", "Set up your loft first");
  const routes: Route[] = [];
  for (const friendId of friends)
    routes.push(await legFor(deps, me, myLofts, roost, { friendId }));
  return { mine, routes };
}

async function birdsOf(
  db: Db,
  me: UserId,
  ids: string[],
  lock: boolean,
): Promise<Map<string, Row<"birds">>> {
  const rows = await db.query<Row<"birds">>(
    `select * from birds where id = any($1::uuid[]) and owner_id = $2
     order by id${lock ? " for update" : ""}`,
    [ids, me],
  );
  return new Map(rows.map((r) => [r.id, r]));
}

function readyBirds(
  rows: Map<string, Row<"birds">>,
  ids: string[],
  input: NoteInput,
  now: number,
  owner: CareOwner,
): { bird: BirdRecord; note: Note }[] {
  return ids.map((id) => readyToFly(rows.get(id), input, now, owner));
}

function readyToFly(
  row: Row<"birds"> | undefined,
  input: NoteInput,
  now: number,
  owner: CareOwner,
): { bird: BirdRecord; note: Note } {
  if (!row) throw new AppError("not_found", "No such bird");
  const bird = toBirdRecord(row);
  if (bird.status !== "home")
    throw new AppError("conflict", `${bird.name} is not home`);
  if (!careAt(snapshotOf(bird), now, owner).canFly)
    throw new AppError("conflict", `${bird.name} is too tired to fly`);
  return { bird, note: readyNote(input, bird, bird.name) };
}

function toFlightInput(
  flightId: string,
  bird: BirdRecord,
  owner: CareOwner,
  from: Endpoint,
  to: Endpoint,
  now: number,
  weather: [WeatherSample, WeatherSample, WeatherSample],
  hazards: { hawk: boolean; fair: boolean },
): FlightInput {
  const care = careAt(snapshotOf(bird), now, owner);
  return {
    flightId,
    from: from.point,
    to: to.point,
    departAtMs: now,
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

async function deliverQuietly(
  deps: Deps,
  notificationId: string,
  flightId: string,
): Promise<void> {
  try {
    await deliver(deps, notificationId);
  } catch (error) {
    log.error("send.notify_failed", {
      notificationId,
      flightId,
      error: error instanceof Error ? error.name : typeof error,
    });
  }
}
