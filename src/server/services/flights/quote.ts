import {
  computeFlightPlan,
  haversineMi,
  hazardsFor,
  interpolate,
  sunTimes,
  type FlightInput,
  type LatLon,
  type WeatherSample,
} from "@/lib/flight/engine";
import { careAt, type CareOwner } from "@/lib/game/care";
import { levelFor } from "@/lib/game/levels";
import {
  activeLoft,
  endpointFor,
  snap,
  type Point,
  type Shows,
} from "@/lib/game/privacy";
import { roostLabel } from "@/lib/places";
import { isWeekend } from "@/lib/game/time";
import type { Deps } from "@/server/deps";
import { AppError } from "@/server/errors";
import type { UserId } from "@/server/ports/auth";
import { toBirdRecord, type BirdRecord, type Row } from "@/server/rows";
import {
  friendshipBetween,
  LOFT_COLUMNS,
  loftsOf,
  type LoftColumns,
} from "@/server/services/friends";
import { factorsFor, type Factor } from "./factors";
import { resolvePlace } from "@/server/services/places";
import { sampleWeather } from "@/server/services/weather";

export type QuoteRecipient =
  { friendId: UserId } | { place: { placeId: string; pin?: Point } };

export type QuoteInput = {
  recipients: QuoteRecipient[];
  birdIds?: string[];
  at?: number[];
};

export type BirdQuote = {
  birdId: string;
  releaseAt: number;
  durationMs: number;
  arriveAt: number;
  odds: number;
  roostsOvernight: boolean;
  factors: Factor[];
  sunsetAt: number;
};

export type RecipientQuote = {
  recipient: QuoteRecipient;
  distanceMi: number;
  from: { label: string };
  to: { label: string };
  quotes: BirdQuote[];
};

export type Endpoint = { point: LatLon; label: string };
type Leg = { from: Endpoint; to: Endpoint };
type Lofts = ReturnType<typeof loftsOf>;

const HOUR_MS = 3_600_000;
const LOFT_SELECT = LOFT_COLUMNS.join(", ");

export async function quote(
  deps: Deps,
  me: UserId,
  input: QuoteInput,
): Promise<{ recipients: RecipientQuote[] }> {
  const [mine] = await deps.db.query<
    LoftColumns & Pick<Row<"profiles">, "has_birdbath" | "timezone">
  >(
    `select ${LOFT_SELECT}, has_birdbath, timezone from profiles where id = $1`,
    [me],
  );
  const myLofts = mine && loftsOf(mine);
  const roost = myLofts && endpointOf("block", myLofts);
  if (!roost) throw new AppError("conflict", "Set up your loft first");
  const owner: CareOwner = { hasBirdbath: mine.has_birdbath };

  const times = releaseTimes(deps, input.at);
  const legs = await Promise.all(
    input.recipients.map((r) => legFor(deps, me, myLofts, roost, r)),
  );
  const birds = await birdsFor(deps, me, input.birdIds, owner);

  const fractions = deps.config.game.weather.sampleFractions;
  const { samples } = await sampleWeather(
    deps,
    legs.flatMap(({ from, to }) =>
      times.flatMap((t) =>
        fractions.map((f) => ({
          ...interpolate(from.point, to.point, f),
          atMs: t,
        })),
      ),
    ),
  );

  return {
    recipients: legs.map(({ from, to }, r) => ({
      recipient: input.recipients[r],
      distanceMi: Math.round(haversineMi(from.point, to.point) * 10) / 10,
      from: { label: from.label },
      to: { label: to.label },
      quotes: times.flatMap((t, i) => {
        const leg = (r * times.length + i) * fractions.length;
        const weather = samples.slice(leg, leg + 3) as [
          WeatherSample,
          WeatherSample,
          WeatherSample,
        ];
        const hazards = hazardsFor(
          t,
          from.point,
          to.point,
          isWeekend(t, mine.timezone),
        );
        return birds.map((bird) =>
          quoteOne(bird, owner, from.point, to.point, t, weather, hazards),
        );
      }),
    })),
  };
}

function releaseTimes(deps: Deps, at: number[] | undefined): number[] {
  const now = deps.clock.now();
  const last = now + deps.config.game.schedule.maxHoursAhead * HOUR_MS;
  const times = at ?? [now];
  if (times.some((t) => t < now || t > last))
    throw new AppError("invalid", "at: outside the schedule window");
  return times;
}

export async function legFor(
  deps: Deps,
  me: UserId,
  myLofts: Lofts,
  roost: Endpoint,
  recipient: QuoteRecipient,
): Promise<Leg> {
  if ("place" in recipient) {
    const { placeId, pin } = recipient.place;
    const place = await resolvePlace(deps, me, placeId);
    if (!pin)
      return { from: roost, to: { point: place.roost, label: place.label } };
    return {
      from: roost,
      to: { point: pin, label: await pinLabel(deps, pin, place.label) },
    };
  }
  const them = recipient.friendId;
  const friendship = await friendshipBetween(deps.db, me, them);
  if (friendship?.status !== "accepted")
    throw new AppError("forbidden", "Not your friend");
  const [theirs] = await deps.db.query<LoftColumns>(
    `select ${LOFT_SELECT} from profiles where id = $1`,
    [them],
  );
  const from = endpointOf(friendship.myShows, myLofts);
  if (!from) throw new AppError("conflict", "Set up your loft first");
  const to = endpointOf(friendship.theirShows, loftsOf(theirs));
  if (!to) throw new AppError("conflict", "That friend has no loft yet");
  return { from, to };
}

async function pinLabel(
  deps: Deps,
  pin: Point,
  fallback: string,
): Promise<string> {
  const { lat, lon } = snap(pin.lat, pin.lon);
  const name = await deps.geocoder.reverse(lat, lon).catch(() => null);
  return (name && roostLabel(name)) ?? fallback;
}

export function endpointOf(shows: Shows, lofts: Lofts): Endpoint | null {
  const loft = activeLoft(lofts);
  const point = endpointFor(shows, lofts);
  if (!loft || !point) return null;
  return { point, label: shows === "city" ? loft.city : loft.label };
}

async function birdsFor(
  deps: Deps,
  me: UserId,
  birdIds: string[] | undefined,
  owner: CareOwner,
): Promise<BirdRecord[]> {
  const now = deps.clock.now();
  if (!birdIds) {
    const rows = await deps.db.query<Row<"birds">>(
      "select * from birds where owner_id = $1 and status = 'home' order by hatched_at, id",
      [me],
    );
    return rows
      .map(toBirdRecord)
      .filter((b) => careAt(snapshotOf(b), now, owner).canFly);
  }
  const wanted = [...new Set(birdIds)];
  const rows = await deps.db.query<Row<"birds">>(
    "select * from birds where id = any($1::uuid[]) and owner_id = $2",
    [wanted, me],
  );
  if (rows.length !== wanted.length)
    throw new AppError("not_found", "No such bird");
  const byId = new Map(rows.map((r) => [r.id, toBirdRecord(r)]));
  return wanted.map((id) => byId.get(id)!);
}

export function snapshotOf(b: BirdRecord) {
  return {
    belly: b.belly,
    feathers: b.feathers,
    energy: b.energy,
    careAtMs: b.careAt,
    lastFedAtMs: b.lastFedAt,
    hungryNotified: b.hungryNotified,
    status: b.status,
  };
}

export function quoteInput(
  bird: BirdRecord,
  owner: CareOwner,
  from: LatLon,
  to: LatLon,
  releaseAt: number,
  weather: [WeatherSample, WeatherSample, WeatherSample],
  hazards: { hawk: boolean; fair: boolean },
): FlightInput {
  const care = careAt(snapshotOf(bird), releaseAt, owner);
  return {
    flightId: `quote:${bird.id}:${releaseAt}`,
    from,
    to,
    departAtMs: releaseAt,
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
    delayEndOverrideMs: releaseAt,
  };
}

function quoteOne(
  bird: BirdRecord,
  owner: CareOwner,
  from: LatLon,
  to: LatLon,
  releaseAt: number,
  weather: [WeatherSample, WeatherSample, WeatherSample],
  hazards: { hawk: boolean; fair: boolean },
): BirdQuote {
  const input = quoteInput(bird, owner, from, to, releaseAt, weather, hazards);
  const plan = computeFlightPlan(input);
  return {
    birdId: bird.id,
    releaseAt,
    durationMs: plan.arriveAtMs - releaseAt,
    arriveAt: plan.arriveAtMs,
    odds: plan.onTimeOdds,
    roostsOvernight: plan.segments.some((s) => s.kind === "roost"),
    factors: factorsFor(input, plan),
    sunsetAt: sunTimes(releaseAt, from).sunsetMs,
  };
}
