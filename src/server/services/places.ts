import { randomUUID } from "node:crypto";
import { z } from "zod";
import emptyStates from "../../../assets/copy/empty-states.json";
import { snap, type Point } from "@/lib/game/privacy";
import { cityLabel, roostLabel } from "@/lib/places";
import type { Db } from "@/server/db";
import type { Deps } from "@/server/deps";
import { AppError } from "@/server/errors";
import { log } from "@/server/log";
import type { UserId } from "@/server/ports/auth";
import type { GeoHit } from "@/server/ports/geocoder";
import { rateLimit } from "@/server/rateLimit";

const HOLD_MS = 10 * 60_000;
const MAX_RESULTS = 6;

export const PLACE_NOT_FOUND = emptyStates.find(
  (s) => s.state === "Place not found",
)!.text;

export const GEOCODER_UNAVAILABLE = emptyStates.find(
  (s) => s.state === "Place search unavailable",
)!.text;

export type PlaceResult = Pick<GeoHit, "label" | "sublabel" | "kind"> & {
  placeId: string;
};

export type HeldPlace = Omit<GeoHit, "lat" | "lon" | "area"> & {
  roost: Point;
};

type Held = { userId: UserId; place: HeldPlace };

const heldKey = (placeId: string) => `place:${placeId}`;

async function heldPlace(deps: Deps, hit: GeoHit): Promise<HeldPlace | null> {
  const { lat, lon, label, sublabel, city, region, country, countryCode } = hit;
  const roost = snap(lat, lon);
  const area = { city, region, country, countryCode, roost };
  if (hit.kind !== "address")
    return { label, sublabel, kind: hit.kind, ...area };
  const name =
    (await deps.geocoder.reverse(roost.lat, roost.lon).catch(() => null)) ??
    hit.area;
  const neighbourhood = roostLabel(name);
  if (!neighbourhood) return null;
  return {
    label: neighbourhood,
    sublabel: cityLabel(name) ?? "",
    kind: "neighbourhood",
    ...area,
  };
}

export async function searchPlaces(
  deps: Deps,
  userId: UserId,
  q: string,
): Promise<{ results: PlaceResult[]; message?: string }> {
  await rateLimit(
    deps.db,
    deps.clock,
    `geo-search:${userId}`,
    deps.config.game.limits.geoSearchPerMinute,
    60,
  );
  const hits = await deps.geocoder.search(q).catch((error: unknown) => {
    log.warn("geo.search_failed", {
      error: error instanceof Error ? error.name : typeof error,
    });
    throw new AppError("unavailable", GEOCODER_UNAVAILABLE);
  });
  const places = await Promise.all(
    hits.slice(0, MAX_RESULTS).map((hit) => heldPlace(deps, hit)),
  );
  const held = places
    .filter((place) => place !== null)
    .map((place) => ({ placeId: randomUUID(), place }));
  if (held.length === 0) return { results: [], message: PLACE_NOT_FOUND };

  await deps.db.tx(async (db) => {
    for (const { placeId, place } of held) {
      await db.query(
        `insert into geo_cache (key, payload, fetched_at)
         values ($1, $2, to_timestamp($3 / 1000.0))`,
        [heldKey(placeId), { userId, place } satisfies Held, deps.clock.now()],
      );
    }
  });
  return {
    results: held.map(({ placeId, place }) => ({
      placeId,
      label: place.label,
      sublabel: place.sublabel,
      kind: place.kind,
    })),
  };
}

const PLACE_ID = z.uuid();

export async function resolvePlace(
  deps: Deps,
  userId: UserId,
  placeId: string,
): Promise<HeldPlace> {
  const unknown = new AppError("invalid", "placeId: unknown place");
  if (!PLACE_ID.safeParse(placeId).success) throw unknown;
  const [row] = await deps.db.query<{ payload: Held }>(
    `select payload from geo_cache
     where key = $1
       and (fetched_at >= to_timestamp($2 / 1000.0) or payload @> '{"saved": true}')`,
    [heldKey(placeId), deps.clock.now() - HOLD_MS],
  );
  if (!row || row.payload.userId !== userId) throw unknown;
  return row.payload.place;
}

export const keepPlace = (db: Db, placeId: string) =>
  db.query(
    `update geo_cache set payload = payload || '{"saved": true}' where key = $1`,
    [heldKey(placeId)],
  );

export async function placeHere(
  deps: Deps,
  roost: Point,
): Promise<{
  place: { label: string; city: string | null } | null;
  message?: string;
}> {
  const name = await deps.geocoder
    .reverse(roost.lat, roost.lon)
    .catch(() => null);
  const label = name && roostLabel(name);
  if (!name || !label) return { place: null, message: PLACE_NOT_FOUND };
  return { place: { label, city: cityLabel(name) } };
}
