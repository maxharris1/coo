import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "@/server/db";
import { AppError } from "@/server/errors";
import type { UserId } from "@/server/ports/auth";
import type { GeoHit } from "@/server/ports/geocoder";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { resolvePlace, searchPlaces } from "./places";

const uuid = vi.hoisted(() => ({ pinned: null as string | null }));

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return {
    ...actual,
    randomUUID: () => uuid.pinned ?? actual.randomUUID(),
  };
});

const ME = "11111111-1111-4111-8111-111111111111" as UserId;
const OTHER = "22222222-2222-4222-8222-222222222222" as UserId;

let deps: TestDeps;

beforeEach(async () => {
  uuid.pinned = null;
  deps = await makeTestDeps();
});

async function expectInvalid(promise: Promise<unknown>) {
  await expect(promise).rejects.toBeInstanceOf(AppError);
  await expect(promise).rejects.toMatchObject({ code: "invalid" });
}

describe("resolvePlace (ac-3)", () => {
  it("returns the held place with its snapped roost", async () => {
    const { results } = await searchPlaces(deps, ME, "Williamsburg");
    const place = await resolvePlace(deps, ME, results[0].placeId);
    expect(place).toMatchObject({
      roost: { lat: 40.708, lon: -73.9575 },
      label: "Williamsburg",
      sublabel: "Brooklyn, New York, NY",
      kind: "neighbourhood",
      city: "New York",
      region: "NY",
      countryCode: "US",
    });
  });

  it("stores only snapped coordinates in geo_cache", async () => {
    await searchPlaces(deps, ME, "Williamsburg");
    const rows = await deps.db.query<{ payload: unknown }>(
      "select payload from geo_cache",
    );
    expect(JSON.stringify(rows)).not.toMatch(/40\.7081|-73\.9571/);
  });

  it.each(["33333333-3333-4333-8333-333333333333", "not-a-uuid", ""])(
    "refuses the unknown placeId %j as invalid",
    async (placeId) => {
      await expectInvalid(resolvePlace(deps, ME, placeId));
    },
  );

  it("refuses someone else's placeId as invalid", async () => {
    const { results } = await searchPlaces(deps, OTHER, "Boston");
    await expectInvalid(resolvePlace(deps, ME, results[0].placeId));
  });

  it("holds a place for 10 minutes", async () => {
    const { results } = await searchPlaces(deps, ME, "Boston");
    deps.clock.advance(10 * 60_000);
    await expect(
      resolvePlace(deps, ME, results[0].placeId),
    ).resolves.toMatchObject({ label: "Boston" });
    deps.clock.advance(1);
    await expectInvalid(resolvePlace(deps, ME, results[0].placeId));
  });
});

const BEDFORD: GeoHit = {
  label: "123 Bedford Avenue",
  sublabel: "Apartment 4B, Brooklyn, New York, NY 11211",
  kind: "address",
  lat: 40.7178,
  lon: -73.9574,
  city: "New York",
  region: "NY",
  country: "United States",
  countryCode: "US",
};

const ADDRESS_TEXT = /Bedford|123|Apartment|4B|11211/;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

const withoutIds = (value: unknown) =>
  JSON.stringify(value, (_key, v: unknown) =>
    typeof v === "string" ? v.replace(UUID, "<id>") : v,
  );

describe("searchPlaces keeps no address (f-1)", () => {
  it.each([null, "53b12328-9d52-445e-b853-813b98b39b1d"])(
    "returns, stores and resolves an address hit as its neighbourhood (place id %s)",
    async (pinned) => {
      uuid.pinned = pinned;
      vi.spyOn(deps.geocoder, "search").mockResolvedValue([BEDFORD]);

      const response = await searchPlaces(deps, ME, "123 Bedford Avenue");
      const stored = await deps.db.query("select * from geo_cache");
      const place = await resolvePlace(deps, ME, response.results[0].placeId);

      expect(response.results).toEqual([
        {
          placeId: expect.any(String),
          label: "Williamsburg",
          sublabel: "New York, NY",
          kind: "neighbourhood",
        },
      ]);
      expect(place).toMatchObject({
        label: "Williamsburg",
        sublabel: "New York, NY",
        kind: "neighbourhood",
        roost: { lat: 40.718, lon: -73.9575 },
      });
      expect(withoutIds({ response, stored, place })).not.toMatch(ADDRESS_TEXT);
    },
  );

  it("drops an address hit that has no neighbourhood or city", async () => {
    vi.spyOn(deps.geocoder, "search").mockResolvedValue([
      { ...BEDFORD, lat: 0, lon: 0 },
    ]);

    const response = await searchPlaces(deps, ME, "123 Bedford Avenue");

    expect(response.results).toEqual([]);
    expect(await deps.db.query("select * from geo_cache")).toEqual([]);
    expect(withoutIds(response)).not.toMatch(ADDRESS_TEXT);
  });
});

function failOnInsert(db: Db, nth: number): Db {
  let inserts = 0;
  const wrap = (inner: Db): Db => ({
    async query<T>(sql: string, params?: unknown[]) {
      if (sql.includes("insert into geo_cache") && ++inserts === nth) {
        throw new Error("insert failed");
      }
      return inner.query<T>(sql, params);
    },
    tx: (fn) => inner.tx((tx) => fn(wrap(tx))),
  });
  return wrap(db);
}

describe("searchPlaces holds its results in one transaction (f-2)", () => {
  it("leaves no held rows when the second insert fails", async () => {
    const db = deps.db;
    deps = { ...deps, db: failOnInsert(db, 2) };

    await expect(searchPlaces(deps, ME, "i")).rejects.toThrow("insert failed");
    expect(await db.query("select * from geo_cache")).toEqual([]);
  });
});
