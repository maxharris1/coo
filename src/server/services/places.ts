import { randomUUID } from "node:crypto";
import { z } from "zod";
import emptyStates from "../../../assets/copy/empty-states.json";
import { snap, type Point } from "@/lib/game/privacy";
import { cityLabel, roostLabel } from "@/lib/places";
import type { Deps } from "@/server/deps";
import { AppError } from "@/server/errors";
import type { UserId } from "@/server/ports/auth";
import type { GeoHit } from "@/server/ports/geocoder";
import { rateLimit } from "@/server/rateLimit";

const HOLD_MS = 10 * 60_000;
const MAX_RESULTS = 6;

export const PLACE_NOT_FOUND = emptyStates.find(
  (s) => s.state === "Place not found",
)!.text;

export type PlaceResult = Pick<GeoHit, "label" | "sublabel" | "kind"> & {
  placeId: string;
};

export type HeldPlace = Omit<GeoHit, "lat" | "lon"> & { roost: Point };

type Held = { userId: UserId; place: HeldPlace };

const heldKey = (placeId: string) => `place:${placeId}`;

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
  const hits = await deps.geocoder.search(q).catch(() => []);
  if (hits.length === 0) return { results: [], message: PLACE_NOT_FOUND };

  const results: PlaceResult[] = [];
  for (const { lat, lon, ...hit } of hits.slice(0, MAX_RESULTS)) {
    const placeId = randomUUID();
    const held: Held = { userId, place: { ...hit, roost: snap(lat, lon) } };
    await deps.db.query(
      `insert into geo_cache (key, payload, fetched_at)
       values ($1, $2, to_timestamp($3 / 1000.0))`,
      [heldKey(placeId), held, deps.clock.now()],
    );
    results.push({
      placeId,
      label: hit.label,
      sublabel: hit.sublabel,
      kind: hit.kind,
    });
  }
  return { results };
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
     where key = $1 and fetched_at >= to_timestamp($2 / 1000.0)`,
    [heldKey(placeId), deps.clock.now() - HOLD_MS],
  );
  if (!row || row.payload.userId !== userId) throw unknown;
  return row.payload.place;
}

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
