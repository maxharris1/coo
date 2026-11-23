import type { BirdStatus, BreedId, GearId } from "@/lib/game/types";

type Tag =
  | "uuid"
  | "text"
  | "int2"
  | "int4"
  | "float8"
  | "numeric"
  | "bool"
  | "timestamptz"
  | "_text";
type Spec = Tag | `${Tag}?`;
type TagType = {
  uuid: string;
  text: string;
  int2: number;
  int4: number;
  float8: number;
  numeric: number;
  bool: boolean;
  timestamptz: Date;
  _text: string[];
};
type Value<S> = S extends `${infer T extends Tag}?`
  ? TagType[T] | null
  : TagType[S & Tag];

export const COLUMNS = {
  profiles: {
    id: "uuid",
    name: "text",
    handle: "text",
    invite_code: "text",
    phone_last4: "text?",
    timezone: "text",
    units: "text",
    seeds: "int4",
    perches: "int2",
    has_birdbath: "bool",
    espresso_shots: "int4",
    deliveries_count: "int4",
    home_lat: "float8?",
    home_lon: "float8?",
    home_label: "text?",
    home_city: "text?",
    home_city_lat: "float8?",
    home_city_lon: "float8?",
    travel_on: "bool",
    travel_lat: "float8?",
    travel_lon: "float8?",
    travel_label: "text?",
    travel_city: "text?",
    travel_city_lat: "float8?",
    travel_city_lon: "float8?",
    travel_changed_at: "timestamptz?",
    notify_landed_in: "bool",
    notify_landed_out: "bool",
    notify_delays: "bool",
    notify_hungry: "bool",
    quiet_on: "bool",
    quiet_start: "int2",
    quiet_end: "int2",
    sms_fallback: "bool",
    installed: "bool",
    onboarded_at: "timestamptz?",
    created_at: "timestamptz",
  },
  birds: {
    id: "uuid",
    owner_id: "uuid",
    name: "text",
    breed: "text",
    look: "text",
    pronoun: "text",
    speed_mph: "numeric",
    focus: "int2",
    navigation: "int2",
    quirks: "_text",
    miles: "numeric",
    deliveries: "int4",
    detours: "int4",
    belly: "numeric",
    feathers: "numeric",
    energy: "numeric",
    care_at: "timestamptz",
    last_fed_at: "timestamptz",
    hungry_notified: "bool",
    status: "text",
    busy_kind: "text?",
    busy_until: "timestamptz?",
    gear: "_text",
    hatched_at: "timestamptz",
  },
  friendships: {
    a_id: "uuid",
    b_id: "uuid",
    status: "text",
    blocked_by: "uuid?",
    a_shows: "text",
    b_shows: "text",
    via: "text",
    created_at: "timestamptz",
  },
  gear_owned: {
    user_id: "uuid",
    gear_id: "text",
    acquired_at: "timestamptz",
  },
  outfits: {
    id: "uuid",
    user_id: "uuid",
    name: "text",
    items: "_text",
    position: "int2",
  },
  eggs: {
    id: "uuid",
    user_id: "uuid",
    hatch_at_delivery: "int4",
    status: "text",
    bird_id: "uuid?",
    laid_at: "timestamptz",
    hatched_at: "timestamptz?",
  },
} as const satisfies Record<string, Record<string, Spec>>;

export type Table = keyof typeof COLUMNS;
export type Row<T extends Table> = {
  -readonly [C in keyof (typeof COLUMNS)[T]]: Value<(typeof COLUMNS)[T][C]>;
};

export function pair(x: string, y: string): [string, string] {
  return x < y ? [x, y] : [y, x];
}

export function toMe(r: Row<"profiles">) {
  const { lat, lon, label, city } = r.travel_on
    ? {
        lat: r.travel_lat,
        lon: r.travel_lon,
        label: r.travel_label,
        city: r.travel_city,
      }
    : {
        lat: r.home_lat,
        lon: r.home_lon,
        label: r.home_label,
        city: r.home_city,
      };
  const loft =
    lat === null || lon === null || label === null || city === null
      ? null
      : { lat, lon, label, city, travelling: r.travel_on };
  return {
    id: r.id,
    name: r.name,
    handle: r.handle,
    inviteCode: r.invite_code,
    phoneLast4: r.phone_last4,
    seeds: r.seeds,
    perches: r.perches,
    hasBirdbath: r.has_birdbath,
    units: r.units,
    timezone: r.timezone,
    loft,
    installed: r.installed,
    settings: {
      notifyLandedIn: r.notify_landed_in,
      notifyLandedOut: r.notify_landed_out,
      notifyDelays: r.notify_delays,
      notifyHungry: r.notify_hungry,
      quietOn: r.quiet_on,
      quietStart: r.quiet_start,
      quietEnd: r.quiet_end,
      smsFallback: r.sms_fallback,
    },
  };
}
export type Me = ReturnType<typeof toMe>;

export function toBirdRecord(r: Row<"birds">) {
  return {
    id: r.id,
    ownerId: r.owner_id,
    name: r.name,
    breed: r.breed as BreedId,
    look: r.look,
    pronoun: r.pronoun,
    speedMph: r.speed_mph,
    focus: r.focus,
    navigation: r.navigation,
    quirks: r.quirks,
    miles: r.miles,
    deliveries: r.deliveries,
    detours: r.detours,
    belly: r.belly,
    feathers: r.feathers,
    energy: r.energy,
    careAt: r.care_at.getTime(),
    lastFedAt: r.last_fed_at.getTime(),
    hungryNotified: r.hungry_notified,
    status: r.status as BirdStatus,
    busyKind: r.busy_kind,
    busyUntil: r.busy_until?.getTime() ?? null,
    gear: r.gear as GearId[],
    hatchedAt: r.hatched_at.getTime(),
  };
}
export type BirdRecord = ReturnType<typeof toBirdRecord>;

export function toOutfit(r: Row<"outfits">) {
  return { id: r.id, name: r.name, items: r.items };
}
export type Outfit = ReturnType<typeof toOutfit>;
