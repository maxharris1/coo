import type { Point } from "@/lib/game/privacy";
import { cityLabel, roostLabel } from "@/lib/places";
import type { Caller, Profile } from "@/server/auth";
import type { Deps } from "@/server/deps";
import { AppError } from "@/server/errors";
import type { UserId } from "@/server/ports/auth";
import type { GeoName } from "@/server/ports/geocoder";
import { toMe, type Me } from "@/server/rows";
import { keepPlace, PLACE_NOT_FOUND, resolvePlace } from "./places";

type LoftPlace = {
  roost: Point;
  label: string;
  city: string;
  cityCentre: Point | null;
};

type LoftInput = ({ roost: Point } | { placeId: string }) & {
  centre?: boolean;
};
export type TravelInput =
  { on: true; roost: Point } | { on: true; placeId: string } | { on: false };
type LoftResult = { loft: Me["loft"] };

const HOUR_MS = 3_600_000;

type Town = Pick<GeoName, "city" | "state" | "country">;

async function cityCentre(
  deps: Deps,
  town: Town,
  attempts: number,
): Promise<Point | null> {
  const query = [town.city, town.state, town.country]
    .filter(Boolean)
    .join(", ");
  for (let i = 0; i < attempts; i++) {
    const [top] = await deps.geocoder.search(query).catch(() => []);
    if (top) return { lat: top.lat, lon: top.lon };
  }
  return null;
}

async function describeRoost(
  deps: Deps,
  roost: Point,
  {
    label,
    town: held,
    centre = false,
    needsCityCentre = false,
  }: {
    label?: string;
    town?: Town;
    centre?: boolean;
    needsCityCentre?: boolean;
  } = {},
): Promise<LoftPlace> {
  const name = await deps.geocoder
    .reverse(roost.lat, roost.lon)
    .catch(() => null);
  const roostName = name && (label ?? roostLabel(name));
  const city = name && cityLabel(name);
  if (!name || !roostName || !city) {
    throw new AppError("invalid", PLACE_NOT_FOUND);
  }
  const town: Town = {
    city: held?.city ?? name.city,
    state: held?.state ?? name.state,
    country: held?.country ?? name.country,
  };
  const middle = await cityCentre(deps, town, needsCityCentre ? 2 : 1);
  if (needsCityCentre && !middle) {
    throw new AppError("invalid", PLACE_NOT_FOUND);
  }
  if (!centre) return { roost, label: roostName, city, cityCentre: middle };
  if (!middle || !town.city) throw new AppError("invalid", PLACE_NOT_FOUND);
  return { roost: middle, label: town.city, city, cityCentre: middle };
}

async function locate(
  deps: Deps,
  userId: UserId,
  input: LoftInput,
  needsCityCentre = false,
): Promise<LoftPlace> {
  const { centre } = input;
  if ("roost" in input) {
    return describeRoost(deps, input.roost, { centre, needsCityCentre });
  }
  const held = await resolvePlace(deps, userId, input.placeId);
  return describeRoost(deps, held.roost, {
    label: held.label,
    town: { city: held.city, state: held.region, country: held.country },
    centre,
    needsCityCentre,
  });
}

const placeColumns = ({ roost, label, city, cityCentre }: LoftPlace) => [
  roost.lat,
  roost.lon,
  label,
  city,
  cityCentre?.lat ?? null,
  cityCentre?.lon ?? null,
];

export async function setLoft(
  deps: Deps,
  { userId, profile }: Caller,
  input: LoftInput,
): Promise<LoftResult> {
  if (!profile) throw new AppError("not_onboarded", "Finish setting up first.");
  const place = await locate(deps, userId, input);
  return deps.db.tx(async (db) => {
    const [row] = await db.query<Profile>(
      `update profiles
       set home_lat = $2, home_lon = $3, home_label = $4,
           home_city = $5, home_city_lat = $6, home_city_lon = $7,
           onboarded_at = coalesce(onboarded_at, to_timestamp($8 / 1000.0))
       where id = $1
       returning *`,
      [userId, ...placeColumns(place), deps.clock.now()],
    );
    if ("placeId" in input) await keepPlace(db, input.placeId);
    return { loft: toMe(row).loft };
  });
}

function isCurrent(profile: Profile, place: LoftPlace | null): boolean {
  if (!place) return !profile.travel_on;
  return (
    profile.travel_on &&
    profile.travel_lat === place.roost.lat &&
    profile.travel_lon === place.roost.lon
  );
}

export async function setTravel(
  deps: Deps,
  userId: UserId,
  input: TravelInput,
): Promise<LoftResult> {
  const place = input.on ? await locate(deps, userId, input, true) : null;
  const now = deps.clock.now();
  const hours = deps.config.game.travel.minHoursBetweenChanges;
  return deps.db.tx(async (db) => {
    const [current] = await db.query<Profile>(
      "select * from profiles where id = $1 for update",
      [userId],
    );
    if (isCurrent(current, place)) return { loft: toMe(current).loft };
    const changedAt = current.travel_changed_at?.getTime();
    if (changedAt !== undefined && now - changedAt < hours * HOUR_MS) {
      throw new AppError(
        "conflict",
        `Travel can only change once every ${hours} hours.`,
      );
    }
    const [row] = place
      ? await db.query<Profile>(
          `update profiles
           set travel_on = true, travel_lat = $2, travel_lon = $3, travel_label = $4,
               travel_city = $5, travel_city_lat = $6, travel_city_lon = $7,
               travel_changed_at = to_timestamp($8 / 1000.0)
           where id = $1
           returning *`,
          [userId, ...placeColumns(place), now],
        )
      : await db.query<Profile>(
          `update profiles
           set travel_on = false, travel_changed_at = to_timestamp($2 / 1000.0)
           where id = $1
           returning *`,
          [userId, now],
        );
    return { loft: toMe(row).loft };
  });
}
