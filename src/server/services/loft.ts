import type { Point } from "@/lib/game/privacy";
import { cityLabel, roostLabel } from "@/lib/places";
import type { Caller, Profile } from "@/server/auth";
import type { Deps } from "@/server/deps";
import { AppError } from "@/server/errors";
import type { UserId } from "@/server/ports/auth";
import type { GeoName } from "@/server/ports/geocoder";
import { toMe, type Me } from "@/server/rows";
import { PLACE_NOT_FOUND, resolvePlace, type HeldPlace } from "./places";

type LoftPlace = {
  roost: Point;
  label: string;
  city: string;
  cityCentre: Point | null;
};

type LoftInput = ({ roost: Point } | { placeId: string }) & {
  centre?: boolean;
};
export type TravelInput = { on: true; roost: Point } | { on: false };
type LoftResult = { loft: Me["loft"] };

const HOUR_MS = 3_600_000;

type Town = Pick<GeoName, "city" | "state" | "country">;

const heldTown = ({ city, region, country }: HeldPlace): Town | undefined =>
  city ? { city, state: region, country } : undefined;

async function cityCentre(deps: Deps, town: Town): Promise<Point | null> {
  const query = [town.city, town.state, town.country]
    .filter(Boolean)
    .join(", ");
  const [top] = await deps.geocoder.search(query).catch(() => []);
  return top ? { lat: top.lat, lon: top.lon } : null;
}

async function describeRoost(
  deps: Deps,
  roost: Point,
  {
    label,
    town: held,
    centre = false,
  }: { label?: string; town?: Town; centre?: boolean } = {},
): Promise<LoftPlace> {
  const name = await deps.geocoder
    .reverse(roost.lat, roost.lon)
    .catch(() => null);
  const roostName = name && (label ?? roostLabel(name));
  const city = name && cityLabel(name);
  if (!name || !roostName || !city) {
    throw new AppError("invalid", PLACE_NOT_FOUND);
  }
  const town = held ?? name;
  const middle = await cityCentre(deps, town);
  if (!centre) return { roost, label: roostName, city, cityCentre: middle };
  if (!middle || !town.city) throw new AppError("invalid", PLACE_NOT_FOUND);
  return { roost: middle, label: town.city, city, cityCentre: middle };
}

async function locate(
  deps: Deps,
  userId: UserId,
  input: LoftInput,
): Promise<LoftPlace> {
  const { centre } = input;
  if ("roost" in input) return describeRoost(deps, input.roost, { centre });
  const held = await resolvePlace(deps, userId, input.placeId);
  return describeRoost(deps, held.roost, {
    label: held.label,
    town: heldTown(held),
    centre,
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
  const [row] = await deps.db.query<Profile>(
    `update profiles
     set home_lat = $2, home_lon = $3, home_label = $4,
         home_city = $5, home_city_lat = $6, home_city_lon = $7,
         onboarded_at = coalesce(onboarded_at, to_timestamp($8 / 1000.0))
     where id = $1
     returning *`,
    [userId, ...placeColumns(place), deps.clock.now()],
  );
  return { loft: toMe(row).loft };
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
  const place = input.on ? await describeRoost(deps, input.roost) : null;
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
