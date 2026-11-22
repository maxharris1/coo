import { randomUUID } from "node:crypto";
import {
  computeFlightPlan,
  hazardsFor,
  interpolate,
  type FlightInput,
  type WeatherSample,
} from "@/lib/flight/engine";
import { careAt, projectCare, type CareOwner } from "@/lib/game/care";
import { levelFor } from "@/lib/game/levels";
import { snap } from "@/lib/game/privacy";
import { noteLimit, validateBody } from "@/lib/game/notes";
import {
  isWeekend,
  startOfLocalDayMs,
  startOfNextLocalDayMs,
} from "@/lib/game/time";
import { AppError } from "@/server/errors";
import { toBirdRecord, type BirdRecord, type Row } from "@/server/rows";
import {
  LOFT_COLUMNS,
  loftsOf,
  type LoftColumns,
} from "@/server/services/friends";
import {
  createGuestLink,
  linkPepper,
} from "@/server/services/guestLinks/create";
import { displayName } from "@/server/services/onboarding";
import { sampleWeather } from "@/server/services/weather";
import { getFlight } from "./get";
import { placeNames } from "./placeNames";
import { endpointOf, legFor, snapshotOf, type Endpoint } from "./quote";
import type { SendHook, SendResult } from "./send";

export type GuestSendResult = SendResult & {
  guestLinks: { flightId: string; url: string }[];
};

type Me = LoftColumns &
  Pick<Row<"profiles">, "has_birdbath" | "timezone" | "name">;

const GUEST_NAME = displayName(30);
const DAY_MS = 24 * 60 * 60 * 1000;

export const guestSend: SendHook = async (
  deps,
  me,
  input,
): Promise<GuestSendResult> => {
  const [item, ...others] = input.sends;
  if (!item || others.length > 0 || !("guest" in item))
    throw new AppError("invalid", "sends: send to someone new on its own");
  const name = GUEST_NAME.safeParse(item.guest.name);
  if (!name.success)
    throw new AppError("invalid", "guest.name: 1 to 30 characters");

  const [mine] = await deps.db.query<Me>(
    `select ${LOFT_COLUMNS.join(", ")}, has_birdbath, timezone, name
     from profiles where id = $1`,
    [me],
  );
  const myLofts = mine && loftsOf(mine);
  const roost = myLofts && endpointOf("block", myLofts);
  if (!roost) throw new AppError("conflict", "Set up your loft first");
  const { from, to } = await legFor(deps, me, myLofts, roost, {
    place: { placeId: item.guest.placeId, pin: item.guest.pin },
  });
  const owner: CareOwner = { hasBirdbath: mine.has_birdbath };
  const [unlocked] = await deps.db.query<Row<"birds">>(
    "select * from birds where id = $1 and owner_id = $2",
    [item.birdId, me],
  );
  const now = deps.clock.now();
  readyToFly(unlocked, input.body, now, owner);

  const [{ samples }, names] = await Promise.all([
    sampleWeather(
      deps,
      deps.config.game.weather.sampleFractions.map((f) => ({
        ...interpolate(from.point, to.point, f),
        atMs: now,
      })),
    ),
    placeNames(deps, from.point, snap(to.point.lat, to.point.lon)),
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

  const url = await deps.db.tx(async (tx) => {
    const [{ timezone }] = await tx.query<{ timezone: string }>(
      "select timezone from profiles where id = $1 for update",
      [me],
    );
    const { reportsToStop, reportWindowDays } = deps.config.game.guestLinks;
    const [{ count: reported }] = await tx.query<{ count: number }>(
      `select count(distinct g.id)::int from reports r
       join guest_links g on g.id = r.guest_link_id
       where g.sender_id = $1 and r.created_at >= $2`,
      [me, new Date(now - reportWindowDays * DAY_MS).toISOString()],
    );
    if (reported >= reportsToStop)
      throw new AppError(
        "forbidden",
        "You can't send to someone new right now",
      );
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
    const [{ count: sentToday }] = await tx.query<{ count: number }>(
      `select count(*)::int from flights
       where owner_id = $1 and kind = 'delivery' and status <> 'cancelled'
         and created_at >= $2 and created_at < $3`,
      [
        me,
        new Date(startOfLocalDayMs(now, timezone)).toISOString(),
        new Date(startOfNextLocalDayMs(now, timezone)).toISOString(),
      ],
    );
    if (sentToday >= deps.config.game.limits.flightsPerDay)
      throw new AppError("rate_limited", "Too many requests. Try again later.");

    const link = await createGuestLink(deps, tx, linkPepper(), {
      senderId: me,
      recipientName: name.data,
      dest: to,
      birdName: bird.name,
      timezone,
      now,
    });
    const [note] = await tx.query<{ id: string }>(
      `insert into notes (sender_id, recipient_id, guest_link_id, body, created_at)
       values ($1, null, $2, $3, $4) returning id`,
      [me, link.id, body, nowIso],
    );
    await tx.query(
      `insert into flights (id, kind, bird_id, owner_id, counterpart_id,
         guest_link_id, note_id, from_lat, from_lon, from_label, to_lat, to_lon,
         to_label, status, release_at, arrive_at, distance_mi, odds, delay_kind,
         input, plan, place_names, created_at)
       values ($1, 'delivery', $2, $3, null, $4, $5, $6, $7, $8, $9, $10, $11,
         'flying', $12, $13, $14, $15, $16, $17, $18, $19, $12)`,
      [
        flightId,
        bird.id,
        me,
        link.id,
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
    await tx.query(
      "insert into events (user_id, kind, created_at) values ($1, 'flight', $2)",
      [me, nowIso],
    );
    return link.url;
  });

  return {
    flights: [await getFlight(deps, me, flightId)],
    guestLinks: [{ flightId, url }],
  };
};

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
