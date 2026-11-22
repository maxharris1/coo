import { createHash } from "node:crypto";
import { z } from "zod";
import { config } from "@/lib/config";
import { snap } from "@/lib/game/privacy";
import type { Clock } from "../clock";
import type { Db } from "../db";
import type { GeoHit, GeoName, Geocoder } from "../ports/geocoder";

const MAX_IN_FLIGHT = 3;
const TIMEOUT_MS = 3000;
const USER_AGENT = `${config.app.name} (https://github.com/maxharris1/coo)`;
const DAY_MS = 24 * 60 * 60 * 1000;
const SEARCH_TTL_MS = DAY_MS;
const REVERSE_TTL_MS = 30 * DAY_MS;
const REVERSE_CELL_DEG = 0.05;

const text = z.string().optional();

const featureSchema = z.object({
  geometry: z.object({
    type: z.literal("Point"),
    coordinates: z.tuple([z.number(), z.number()]),
  }),
  properties: z.object({
    name: text,
    type: text,
    osm_value: text,
    locality: text,
    district: text,
    city: text,
    state: text,
    country: text,
    countrycode: text,
  }),
});

type Feature = z.infer<typeof featureSchema>;

const collectionSchema = z.object({ features: z.array(z.unknown()) });

type Place = "city" | "district" | "locality";

const PLACE_BY_TYPE = new Map<string, Place>([
  ["city", "city"],
  ["district", "district"],
  ["locality", "locality"],
]);

const PLACE_BY_OSM_VALUE = new Map<string, Place>([
  ["city", "city"],
  ["town", "city"],
  ["village", "city"],
  ["suburb", "district"],
  ["neighbourhood", "locality"],
  ["quarter", "locality"],
]);

const KIND_BY_PLACE: Record<Place, "neighbourhood" | "city"> = {
  city: "city",
  district: "neighbourhood",
  locality: "neighbourhood",
};

const US_STATE_CODES = new Map<string, string>([
  ["Alabama", "AL"],
  ["Alaska", "AK"],
  ["Arizona", "AZ"],
  ["Arkansas", "AR"],
  ["California", "CA"],
  ["Colorado", "CO"],
  ["Connecticut", "CT"],
  ["Delaware", "DE"],
  ["District of Columbia", "DC"],
  ["Florida", "FL"],
  ["Georgia", "GA"],
  ["Hawaii", "HI"],
  ["Idaho", "ID"],
  ["Illinois", "IL"],
  ["Indiana", "IN"],
  ["Iowa", "IA"],
  ["Kansas", "KS"],
  ["Kentucky", "KY"],
  ["Louisiana", "LA"],
  ["Maine", "ME"],
  ["Maryland", "MD"],
  ["Massachusetts", "MA"],
  ["Michigan", "MI"],
  ["Minnesota", "MN"],
  ["Mississippi", "MS"],
  ["Missouri", "MO"],
  ["Montana", "MT"],
  ["Nebraska", "NE"],
  ["Nevada", "NV"],
  ["New Hampshire", "NH"],
  ["New Jersey", "NJ"],
  ["New Mexico", "NM"],
  ["New York", "NY"],
  ["North Carolina", "NC"],
  ["North Dakota", "ND"],
  ["Ohio", "OH"],
  ["Oklahoma", "OK"],
  ["Oregon", "OR"],
  ["Pennsylvania", "PA"],
  ["Rhode Island", "RI"],
  ["South Carolina", "SC"],
  ["South Dakota", "SD"],
  ["Tennessee", "TN"],
  ["Texas", "TX"],
  ["Utah", "UT"],
  ["Vermont", "VT"],
  ["Virginia", "VA"],
  ["Washington", "WA"],
  ["West Virginia", "WV"],
  ["Wisconsin", "WI"],
  ["Wyoming", "WY"],
]);

function defined<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as T;
}

function stateCode(p: Feature["properties"]): string | undefined {
  return p.countrycode === "US" && p.state
    ? US_STATE_CODES.get(p.state)
    : undefined;
}

function placeOf(p: Feature["properties"]): Place | undefined {
  return (
    PLACE_BY_TYPE.get(p.type ?? "") ?? PLACE_BY_OSM_VALUE.get(p.osm_value ?? "")
  );
}

function toHit(feature: Feature): GeoHit | null {
  const { geometry, properties: p } = feature;
  const place = placeOf(p);
  const label = place ? p.name : (p.locality ?? p.district ?? p.city);
  if (!label) return null;
  const city = p.city ?? (place === "city" ? p.name : undefined);
  const region = stateCode(p) ?? p.state;
  const foreignCountry = p.countrycode === "US" ? undefined : p.country;
  const sublabel = [p.district, city, region, foreignCountry]
    .filter((part, i, parts): part is string =>
      Boolean(part && part !== label && parts.indexOf(part) === i),
    )
    .join(", ");
  const [lon, lat] = geometry.coordinates;
  const kind = place
    ? { kind: KIND_BY_PLACE[place] }
    : { kind: "address" as const, area: toName(feature) };
  return defined({
    ...kind,
    label,
    sublabel,
    ...snap(lat, lon),
    city,
    region,
    country: p.country,
    countryCode: p.countrycode,
  });
}

function toName({ properties: p }: Feature): GeoName {
  const place = placeOf(p);
  const own = (kind: Place) => (place === kind ? p.name : undefined);
  return defined({
    neighbourhood: p.locality ?? own("locality"),
    suburb: p.district ?? own("district"),
    city: p.city ?? own("city"),
    state: p.state,
    stateCode: stateCode(p),
    country: p.country,
    countryCode: p.countrycode,
  });
}

function parseFeatures(body: unknown): Feature[] {
  const { features } = collectionSchema.parse(body);
  return features.flatMap((raw) => {
    const parsed = featureSchema.safeParse(raw);
    return parsed.success ? [parsed.data] : [];
  });
}

function limiter(max: number) {
  let active = 0;
  const waiting: (() => void)[] = [];
  return async <T>(fn: () => Promise<T>): Promise<T> => {
    if (active < max) active++;
    else await new Promise<void>((resolve) => waiting.push(resolve));
    try {
      return await fn();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}

function normalizeQuery(q: string): string {
  return q.trim().toLowerCase().replace(/\s+/g, " ");
}

function searchKey(query: string): string {
  return `search:v2:${createHash("sha256").update(query).digest("hex")}`;
}

function reverseCell(deg: number): string {
  return (Math.round(deg / REVERSE_CELL_DEG) * REVERSE_CELL_DEG).toFixed(2);
}

async function cached<T>(
  db: Db,
  clock: Clock,
  key: string,
  ttlMs: number,
  load: () => Promise<T>,
): Promise<T> {
  const [row] = await db.query<{ payload: T }>(
    "select payload from geo_cache where key = $1 and fetched_at > to_timestamp($2 / 1000.0)",
    [key, clock.now() - ttlMs],
  );
  if (row) return row.payload;
  const payload = await load();
  await db.query(
    `insert into geo_cache (key, payload, fetched_at)
     values ($1, $2::jsonb, to_timestamp($3 / 1000.0))
     on conflict (key) do update
       set payload = excluded.payload, fetched_at = excluded.fetched_at`,
    [key, JSON.stringify(payload), clock.now()],
  );
  return payload;
}

export function photon(opts: {
  baseUrl: string;
  fetch?: typeof fetch;
}): (db: Db, clock: Clock) => Geocoder {
  const base = opts.baseUrl.replace(/\/+$/, "");
  const doFetch = opts.fetch ?? ((input, init) => fetch(input, init));
  const slot = limiter(MAX_IN_FLIGHT);

  const features = (path: string, params: Record<string, string>) =>
    slot(async () => {
      const controller = new AbortController();
      const timer = setTimeout(
        () =>
          controller.abort(
            new Error(`photon timed out after ${TIMEOUT_MS} ms`),
          ),
        TIMEOUT_MS,
      );
      try {
        const query = new URLSearchParams({ ...params, lang: "en" });
        const res = await doFetch(`${base}${path}?${query}`, {
          signal: controller.signal,
          headers: { "User-Agent": USER_AGENT },
        });
        if (!res.ok) {
          await res.body?.cancel();
          throw new Error(`photon ${path} answered ${res.status}`);
        }
        return parseFeatures(await res.json());
      } finally {
        clearTimeout(timer);
      }
    });

  return (db, clock) => ({
    async search(q) {
      const query = normalizeQuery(q);
      const { hits } = await cached(
        db,
        clock,
        searchKey(query),
        SEARCH_TTL_MS,
        async () => ({
          hits: (await features("/api", { q: query, limit: "6" })).flatMap(
            (f) => toHit(f) ?? [],
          ),
        }),
      );
      return hits;
    },
    async reverse(lat, lon) {
      const key = `reverse:${reverseCell(lat)},${reverseCell(lon)}`;
      const { name } = await cached(
        db,
        clock,
        key,
        REVERSE_TTL_MS,
        async () => {
          const [first] = await features("/reverse", {
            lat: String(lat),
            lon: String(lon),
            limit: "1",
          });
          return { name: first ? toName(first) : null };
        },
      );
      return name;
    },
  });
}
