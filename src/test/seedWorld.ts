import type { Db } from "@/server/db";
import { config } from "@/lib/config";
import { pair } from "@/server/rows";

export type SeededBird = { id: string; name: string };
export type Person = {
  id: string;
  name: string;
  handle: string;
  birds: SeededBird[];
};
export type World = { max: Person; priya: Person; rosa: Person };

type Loft = {
  label: string;
  city: keyof typeof CITIES;
  lat: number;
  lon: number;
};
type PersonSpec = { id: string; name: string; loft: Loft; birds: SeededBird[] };

const CITIES = {
  "New York": { lat: 40.712, lon: -74.005 },
  Philadelphia: { lat: 39.952, lon: -75.165 },
};

const PEOPLE: Record<keyof World, PersonSpec> = {
  max: {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Max",
    loft: {
      label: "East Village",
      city: "New York",
      lat: 40.73,
      lon: -73.9875,
    },
    birds: [
      { id: "00000000-0000-4000-b000-000000000011", name: "Gerald" },
      { id: "00000000-0000-4000-b000-000000000012", name: "Brenda" },
    ],
  },
  priya: {
    id: "00000000-0000-4000-8000-000000000002",
    name: "Priya",
    loft: {
      label: "Center City",
      city: "Philadelphia",
      lat: 39.952,
      lon: -75.165,
    },
    birds: [
      { id: "00000000-0000-4000-b000-000000000021", name: "Kevin" },
      { id: "00000000-0000-4000-b000-000000000022", name: "Pip" },
    ],
  },
  rosa: {
    id: "00000000-0000-4000-8000-000000000003",
    name: "Rosa",
    loft: {
      label: "Williamsburg",
      city: "New York",
      lat: 40.708,
      lon: -73.9575,
    },
    birds: [
      { id: "00000000-0000-4000-b000-000000000031", name: "Lou" },
      { id: "00000000-0000-4000-b000-000000000032", name: "Biscuit" },
    ],
  },
};

const FRIENDS: [keyof World, keyof World][] = [
  ["max", "priya"],
  ["max", "rosa"],
];

export async function seedWorld(db: Db, nowMs: number): Promise<World> {
  const { start } = config.game;
  const now = new Date(nowMs).toISOString();
  return db.tx(async (t) => {
    const entries = Object.entries(PEOPLE) as [keyof World, PersonSpec][];
    for (const [n, [handle, { id, name, loft, birds }]] of entries.entries()) {
      const city = CITIES[loft.city];
      await t.query(
        "insert into auth.users (id, phone, created_at) values ($1, $2, $3)",
        [id, `1555000000${n + 1}`, now],
      );
      await t.query(
        `insert into profiles (id, name, handle, invite_code, home_lat, home_lon, home_label,
           home_city, home_city_lat, home_city_lon, onboarded_at, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11)`,
        [
          id,
          name,
          handle,
          `seed-${handle}`,
          loft.lat,
          loft.lon,
          loft.label,
          loft.city,
          city.lat,
          city.lon,
          now,
        ],
      );
      await t.query("select apply_seeds($1, $2, 'welcome', $1)", [
        id,
        start.seeds,
      ]);
      await t.query(
        "update seed_ledger set created_at = $2 where user_id = $1 and reason = 'welcome' and ref_id = $1",
        [id, now],
      );
      for (const [i, bird] of birds.entries()) {
        const stats = start.birds[i];
        await t.query(
          `insert into birds (id, owner_id, name, look, speed_mph, focus, navigation,
             belly, feathers, energy, care_at, last_fed_at, hatched_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $11, $11)`,
          [
            bird.id,
            id,
            bird.name,
            start.looks[i],
            stats.speedMph,
            stats.focus,
            stats.navigation,
            start.care.belly,
            start.care.feathers,
            start.care.energy,
            now,
          ],
        );
      }
      await t.query(
        "insert into gear_owned (user_id, gear_id, acquired_at) select $1, unnest($2::text[]), $3",
        [id, start.gear, now],
      );
      await t.query(
        "insert into outfits (user_id, name, items) values ($1, 'Everyday', $2)",
        [id, start.gear],
      );
    }
    for (const [x, y] of FRIENDS) {
      await t.query(
        "insert into friendships (a_id, b_id, created_at) values ($1, $2, $3)",
        [...pair(PEOPLE[x].id, PEOPLE[y].id), now],
      );
    }
    const person = (handle: keyof World): Person => {
      const { id, name, birds } = PEOPLE[handle];
      return { id, name, handle, birds: birds.map((b) => ({ ...b })) };
    };
    return { max: person("max"), priya: person("priya"), rosa: person("rosa") };
  });
}
