import { beforeEach, describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import type { UserId } from "@/server/ports/auth";
import { onboard } from "@/server/services/onboarding";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { geoClient } from "@/test/geoRoute";
import { confirmLine, shopRows, type BuyRow } from "@/app/(app)/shop/shop";
import { shopGet } from "./get";

const SETUP = {
  timezone: "America/New_York",
  bird: { name: "Gerald", look: "gerald", pronoun: "he" },
};

let deps: TestDeps;
let client: ReturnType<typeof geoClient>;

beforeEach(async () => {
  deps = await makeTestDeps();
  client = geoClient(deps, shopGet, "/api/shop");
});

async function withProfile(number: string, name: string) {
  const session = await client.signIn(number);
  await onboard(deps, session.id as UserId, { ...SETUP, name });
  return session;
}

async function onboarded(number: string, name: string) {
  const session = await withProfile(number, name);
  await deps.db.query(
    "update profiles set onboarded_at = to_timestamp($2 / 1000.0) where id = $1",
    [session.id, deps.clock.now()],
  );
  return session;
}

async function setSeeds(id: string, seeds: number) {
  const [{ current }] = await deps.db.query<{ current: number }>(
    "select seeds as current from profiles where id = $1",
    [id],
  );
  if (seeds !== current) {
    await deps.db.query("select apply_seeds($1, $2, 'test', null)", [
      id,
      seeds - current,
    ]);
  }
}

type GearRow = {
  id: string;
  price: number;
  forSale: boolean;
  owned: boolean;
  affordable: boolean;
};

const gearOf = (json: { gear: GearRow[] }, id: string) =>
  json.gear.find((g) => g.id === id);

describe("GET /api/shop", () => {
  it("refuses a request without a session as 401", async () => {
    const { status, json } = await client.get({});
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
  });

  it("refuses a user who has not finished onboarding as 409 not_onboarded", async () => {
    const { jar } = await withProfile("(555) 123-4567", "Max");
    const { status, json } = await client.get({}, jar);
    expect(status).toBe(409);
    expect(json.error.code).toBe("not_onboarded");
  });

  it("lists every gear item with owned and affordable, the backpack not for sale", async () => {
    const { id, jar } = await onboarded("(555) 123-4567", "Max");
    await setSeeds(id, 120);
    const { status, json } = await client.get({}, jar);
    expect(status).toBe(200);
    expect(json.seeds).toBe(120);
    expect(json.gear.map((g: GearRow) => g.id)).toEqual(
      config.gear.items.map((i) => i.id),
    );
    expect(gearOf(json, "bell")).toMatchObject({ owned: true });
    expect(gearOf(json, "goggles")).toMatchObject({
      price: 120,
      forSale: true,
      owned: false,
      affordable: true,
    });
    expect(gearOf(json, "cap")).toMatchObject({
      price: 160,
      owned: false,
      affordable: false,
    });
    expect(gearOf(json, "backpack")).toMatchObject({
      forSale: false,
      owned: false,
      affordable: false,
    });
  });

  it("sells the night-vision goggles for 200 as buy, short or owned", async () => {
    const { id, jar } = await onboarded("(555) 123-4567", "Max");
    const goggleRow = async () => {
      const { json } = await client.get({}, jar);
      return shopRows(json).gear.find((r) => r.itemId === "nightgoggles");
    };
    await setSeeds(id, 199);
    expect((await goggleRow())?.action).toEqual({
      kind: "short",
      price: 200,
      toGo: 1,
    });
    await setSeeds(id, 200);
    const row = await goggleRow();
    expect(row).toMatchObject({
      name: "Night-vision goggles",
      action: { kind: "buy", price: 200 },
    });
    expect(confirmLine(row as BuyRow)).toBe(
      "Buy the night-vision goggles for 200 seeds?",
    );
    await deps.db.query(
      "insert into gear_owned (user_id, gear_id, acquired_at) values ($1, 'nightgoggles', now())",
      [id],
    );
    expect((await goggleRow())?.action).toEqual({
      kind: "owned",
      label: "In the closet",
    });
  });

  it("lists the loft items with owned and affordable", async () => {
    const { id, jar } = await onboarded("(555) 123-4567", "Max");
    await setSeeds(id, 219);
    let { json } = await client.get({}, jar);
    expect(json.loftItems).toEqual([
      expect.objectContaining({
        id: "birdbath",
        price: 220,
        owned: false,
        affordable: false,
      }),
    ]);
    await setSeeds(id, 220);
    ({ json } = await client.get({}, jar));
    expect(json.loftItems[0]).toMatchObject({ owned: false, affordable: true });
    await deps.db.query(
      "update profiles set has_birdbath = true where id = $1",
      [id],
    );
    ({ json } = await client.get({}, jar));
    expect(json.loftItems[0]).toMatchObject({ owned: true });
  });

  it("shows the next perch with its price and how many seeds to go", async () => {
    const { id, jar } = await onboarded("(555) 123-4567", "Max");
    await setSeeds(id, 100);
    let { json } = await client.get({}, jar);
    expect(json.nextPerch).toEqual({
      number: 4,
      price: 250,
      toGo: 150,
      affordable: false,
    });
    await deps.db.query("update profiles set perches = 4 where id = $1", [id]);
    await setSeeds(id, 500);
    ({ json } = await client.get({}, jar));
    expect(json.nextPerch).toEqual({
      number: 5,
      price: 400,
      toGo: 0,
      affordable: true,
    });
  });

  it("shows no next perch at 5 perches", async () => {
    const { id, jar } = await onboarded("(555) 123-4567", "Max");
    await deps.db.query("update profiles set perches = 5 where id = $1", [id]);
    const { json } = await client.get({}, jar);
    expect(json.nextPerch).toBeNull();
  });

  it("reflects only the caller's closet and balance", async () => {
    const other = await onboarded("(555) 765-4321", "Brenda");
    await setSeeds(other.id, 1000);
    await deps.db.query(
      "insert into gear_owned (user_id, gear_id, acquired_at) values ($1, 'goggles', now())",
      [other.id],
    );
    await deps.db.query(
      "update profiles set has_birdbath = true, perches = 5 where id = $1",
      [other.id],
    );
    const { id, jar } = await onboarded("(555) 123-4567", "Max");
    await setSeeds(id, 10);
    const { json } = await client.get({ userId: other.id }, jar);
    expect(json.seeds).toBe(10);
    expect(gearOf(json, "goggles")).toMatchObject({
      owned: false,
      affordable: false,
    });
    expect(json.loftItems[0]).toMatchObject({ owned: false });
    expect(json.nextPerch).toMatchObject({ number: 4, toGo: 240 });
  });
});
