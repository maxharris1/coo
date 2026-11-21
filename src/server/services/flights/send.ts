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
import { noteLimit, validateBody } from "@/lib/game/notes";
import { isWeekend } from "@/lib/game/time";
import type { Deps } from "@/server/deps";
import { AppError } from "@/server/errors";
import { rateLimit } from "@/server/rateLimit";
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
import { getFlight } from "./get";
import { guestSend } from "./guestSend";
import { placeNames } from "./placeNames";
import { endpointOf, legFor, snapshotOf, type Endpoint } from "./quote";
import { schedule } from "./schedule";
import { sendMany } from "./sendMany";
import type { Flight } from "./shape";

export type SendItem =
  | { friendId: UserId; birdId: string }
  | { guest: { name: string; placeId: string }; birdId: string };

export type SendInput = { body: string; sends: SendItem[]; releaseAt?: number };

export type SendResult = { flights: Flight[] };

export type SendHook = (
  deps: Deps,
  me: UserId,
  input: SendInput,
) => Promise<SendResult>;

type Me = LoftColumns &
  Pick<Row<"profiles">, "has_birdbath" | "timezone" | "name">;

export async function send(
  deps: Deps,
  me: UserId,
  input: SendInput,
): Promise<SendResult> {
  if (input.releaseAt !== undefined) return schedule(deps, me, input);
  if (input.sends.some((s) => "guest" in s)) return guestSend(deps, me, input);
  if (input.sends.length > 1) return sendMany(deps, me, input);
  const [item] = input.sends;
  if (!item || "guest" in item)
    throw new AppError("invalid", "sends: pick a friend and a bird");
  const friend = item.friendId;

  const { mine, from, to } = await prepareLeg(deps, me, friend);
  const owner: CareOwner = { hasBirdbath: mine.has_birdbath };
  const [unlocked] = await deps.db.query<Row<"birds">>(
    "select * from birds where id = $1 and owner_id = $2",
    [item.birdId, me],
  );
  const now = deps.clock.now();
  readyToFly(unlocked, input.body, now, owner);

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
      [friend],
    ),
  ]);
  const weather = samples.slice(0, 3) as FlightInput["weather"];
  const hazards = hazardsFor(
    now,
    from.point,
    to.point,
    isWeekend(now, mine.timezone),
  );
  const flightId = randomUUID();
  const nowIso = new Date(now).toISOString();

  const notification = await deps.db.tx(async (tx) => {
    await tx.query(
      "select 1 from profiles where id = any($1::uuid[]) order by id for share",
      [[me, friend]],
    );
    await tx.query(
      "select 1 from friendships where a_id = $1 and b_id = $2 for share",
      pair(me, friend),
    );
    const current = await prepareLeg({ ...deps, db: tx }, me, friend);
    if (
      JSON.stringify([current.from, current.to]) !== JSON.stringify([from, to])
    )
      throw new AppError("forbidden", "Your friend changed what they share");
    const [locked] = await tx.query<Row<"birds">>(
      "select * from birds where id = $1 and owner_id = $2 for update",
      [item.birdId, me],
    );
    const { bird, body } = readyToFly(locked, input.body, now, owner);
    const flight = toFlightInput(
      flightId,
      bird,
      owner,
      from,
      to,
      now,
      weather,
      hazards,
    );
    const plan = computeFlightPlan(flight);

    const care = projectCare(snapshotOf(bird), now, owner);
    const claimed = await tx.query(
      `update birds set status = 'flying', belly = $3, feathers = $4,
         energy = $5, care_at = $6
       where id = $1 and owner_id = $2 and status = 'home' returning id`,
      [bird.id, me, care.belly, care.feathers, care.energy, nowIso],
    );
    if (claimed.length === 0)
      throw new AppError("conflict", "That bird is not home");
    await rateLimit(
      tx,
      deps.clock,
      `flights:${me}`,
      deps.config.game.limits.flightsPerDay,
      86400,
    );

    const [note] = await tx.query<{ id: string }>(
      `insert into notes (sender_id, recipient_id, body, created_at)
       values ($1, $2, $3, $4) returning id`,
      [me, friend, body, nowIso],
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
        note.id,
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
        JSON.stringify(flight),
        JSON.stringify(plan),
        JSON.stringify(names),
      ],
    );

    const created = await recordNotification(tx, now, {
      userId: friend,
      kind: "incoming",
      refId: flightId,
      ...notificationText(
        "incoming",
        {
          bird: bird.name,
          fromCity: from.label,
          friend: mine.name,
          eta: clockTime(new Date(plan.arriveAtMs), them.timezone),
          flightId,
        },
        bird.pronoun as Pronoun,
      ),
    });
    await tx.query(
      "insert into events (user_id, kind, created_at) select unnest($1::uuid[]), 'flight', $2",
      [[me, friend], nowIso],
    );
    return created;
  });

  if (notification) await deliver(deps, notification.id);
  return { flights: [await getFlight(deps, me, flightId)] };
}

async function prepareLeg(
  deps: Deps,
  me: UserId,
  friend: UserId,
): Promise<{ mine: Me; from: Endpoint; to: Endpoint }> {
  const [mine] = await deps.db.query<Me>(
    `select ${LOFT_COLUMNS.join(", ")}, has_birdbath, timezone, name
     from profiles where id = $1`,
    [me],
  );
  const myLofts = mine && loftsOf(mine);
  const roost = myLofts && endpointOf("block", myLofts);
  if (!roost) throw new AppError("conflict", "Set up your loft first");
  const leg = await legFor(deps, me, myLofts, roost, {
    friendId: friend,
  });
  return { mine, ...leg };
}

function readyToFly(
  row: Row<"birds"> | undefined,
  text: string,
  now: number,
  owner: CareOwner,
): { bird: BirdRecord; body: string } {
  if (!row) throw new AppError("not_found", "No such bird");
  const bird = toBirdRecord(row);
  if (bird.status !== "home")
    throw new AppError("conflict", "That bird is not home");
  if (!careAt(snapshotOf(bird), now, owner).canFly)
    throw new AppError("conflict", "That bird is too tired to fly");
  const checked = validateBody(text, noteLimit(bird));
  if (!checked.ok)
    throw new AppError(
      "invalid",
      checked.reason === "empty"
        ? "body: write a note first"
        : `body: ${checked.length} of ${checked.limit} characters`,
    );
  return { bird, body: checked.body };
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
