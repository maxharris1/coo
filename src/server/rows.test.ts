import { beforeAll, describe, expect, expectTypeOf, it } from "vitest";
import { config } from "@/lib/config";
import type { Db } from "@/server/db";
import { seedWorld, type World } from "@/test/seedWorld";
import { testDb } from "@/test/testDb";
import {
  COLUMNS,
  toBirdRecord,
  toMe,
  toOutfit,
  type Row,
  type Table,
} from "./rows";

const NOW = Date.UTC(2026, 10, 19, 15, 0, 0);
const { start } = config.game;

type ColumnInfo = {
  table_name: string;
  column_name: string;
  udt_name: string;
  is_nullable: "YES" | "NO";
};

async function liveColumns(
  db: Db,
): Promise<Record<string, Record<string, string>>> {
  const rows = await db.query<ColumnInfo>(
    `select table_name, column_name, udt_name, is_nullable
       from information_schema.columns
      where table_schema = 'public' and table_name = any($1)`,
    [Object.keys(COLUMNS)],
  );
  const live: Record<string, Record<string, string>> = {};
  for (const c of rows) {
    live[c.table_name] ??= {};
    live[c.table_name][c.column_name] =
      c.is_nullable === "YES" ? `${c.udt_name}?` : c.udt_name;
  }
  return live;
}

async function one<T extends Table>(
  db: Db,
  table: T,
  id: string,
): Promise<Row<T>> {
  const [row] = await db.query<Row<T>>(`select * from ${table} where id = $1`, [
    id,
  ]);
  return row;
}

let db: Db;
let world: World;

beforeAll(async () => {
  db = await testDb();
  world = await seedWorld(db, NOW);
});

describe("COLUMNS", () => {
  it("matches the live schema of the five seeded tables", async () => {
    expect(await liveColumns(db)).toEqual(COLUMNS);
  });

  it.each([
    ["an added column", "alter table outfits add column colour text"],
    ["a dropped column", "alter table gear_owned drop column acquired_at"],
    ["a retyped column", "alter table birds alter column focus type integer"],
  ])("no longer matches after %s", async (_, ddl) => {
    const fresh = await testDb();
    await fresh.query(ddl);
    expect(await liveColumns(fresh)).not.toEqual(COLUMNS);
  });

  it("types each column from its spec", () => {
    expectTypeOf<Row<"birds">["speed_mph"]>().toEqualTypeOf<number>();
    expectTypeOf<Row<"birds">["busy_until"]>().toEqualTypeOf<Date | null>();
    expectTypeOf<Row<"outfits">["items"]>().toEqualTypeOf<string[]>();
    expectTypeOf<Row<"profiles">["home_label"]>().toEqualTypeOf<
      string | null
    >();
  });
});

describe("mappers", () => {
  it("toMe reads the home loft and the settings", async () => {
    const { max } = world;
    expect(toMe(await one(db, "profiles", max.id))).toEqual({
      id: max.id,
      name: "Max",
      handle: "max",
      inviteCode: "seed-max",
      phoneLast4: null,
      seeds: start.seeds,
      perches: start.perches,
      espressoShots: 0,
      hasBirdbath: false,
      units: "mi",
      timezone: "America/New_York",
      loft: {
        lat: 40.73,
        lon: -73.9875,
        label: "East Village",
        city: "New York",
        travelling: false,
      },
      installed: false,
      settings: {
        notifyLandedIn: true,
        notifyLandedOut: true,
        notifyDelays: true,
        notifyHungry: true,
        quietOn: true,
        quietStart: 22,
        quietEnd: 7,
        smsFallback: true,
      },
    });
  });

  it("toMe exposes the last four digits of the phone once known", async () => {
    const { max } = world;
    await db.query("update profiles set phone_last4 = '0142' where id = $1", [
      max.id,
    ]);
    expect(toMe(await one(db, "profiles", max.id)).phoneLast4).toBe("0142");
  });

  it("toMe exposes how many espresso shots are held", async () => {
    const { max } = world;
    await db.query("update profiles set espresso_shots = 3 where id = $1", [
      max.id,
    ]);
    expect(toMe(await one(db, "profiles", max.id)).espressoShots).toBe(3);
  });

  it("toMe reads the travel loft while travelling", async () => {
    const { priya } = world;
    await db.query(
      `update profiles set travel_on = true, travel_lat = 40.73, travel_lon = -73.9875,
         travel_label = 'East Village', travel_city = 'New York' where id = $1`,
      [priya.id],
    );
    expect(toMe(await one(db, "profiles", priya.id)).loft).toEqual({
      lat: 40.73,
      lon: -73.9875,
      label: "East Village",
      city: "New York",
      travelling: true,
    });
  });

  it("toMe has no loft before the home loft is set", async () => {
    const { rosa } = world;
    await db.query(
      `update profiles set home_lat = null, home_lon = null, home_label = null,
         home_city = null, home_city_lat = null, home_city_lon = null where id = $1`,
      [rosa.id],
    );
    expect(toMe(await one(db, "profiles", rosa.id)).loft).toBeNull();
  });

  it("toBirdRecord reads every stored column with times in epoch ms", async () => {
    const { max } = world;
    const [gerald] = max.birds;
    expect(toBirdRecord(await one(db, "birds", gerald.id))).toEqual({
      id: gerald.id,
      ownerId: max.id,
      name: "Gerald",
      breed: "city",
      look: start.looks[0],
      pronoun: "they",
      speedMph: start.birds[0].speedMph,
      focus: start.birds[0].focus,
      navigation: start.birds[0].navigation,
      quirks: [],
      miles: 0,
      deliveries: 0,
      detours: 0,
      belly: start.care.belly,
      feathers: start.care.feathers,
      energy: start.care.energy,
      careAt: NOW,
      lastFedAt: NOW,
      hungryNotified: false,
      status: "home",
      busyKind: null,
      busyUntil: null,
      gear: [],
      hatchedAt: NOW,
    });
  });

  it("toBirdRecord reads a busy bird's end time in epoch ms", async () => {
    const [, brenda] = world.max.birds;
    const until = NOW + 3_600_000;
    await db.query(
      "update birds set status = 'busy', busy_kind = 'nap', busy_until = $2 where id = $1",
      [brenda.id, new Date(until).toISOString()],
    );
    const bird = toBirdRecord(await one(db, "birds", brenda.id));
    expect(bird).toMatchObject({
      status: "busy",
      busyKind: "nap",
      busyUntil: until,
    });
  });

  it("toOutfit reads the starter outfit", async () => {
    const [row] = await db.query<Row<"outfits">>(
      "select * from outfits where user_id = $1",
      [world.max.id],
    );
    expect(toOutfit(row)).toEqual({
      id: row.id,
      name: "Everyday",
      items: start.gear,
    });
  });
});
