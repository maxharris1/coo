import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { toE164, type E164 } from "@/lib/phone";
import { createJsonRoute } from "@/server/http";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { FakeJar } from "@/test/fakes/jar";
import { seedWorld, type World } from "@/test/seedWorld";
import { birdGearPut } from "./put";

const MAX_PHONE = "+15550000001";
const HOUR = 3_600_000;

let deps: TestDeps;
let world: World;
let gerald: string;
let brenda: string;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
  [gerald, brenda] = world.max.birds.map((b) => b.id);
  await deps.db.query(
    "insert into gear_owned (user_id, gear_id) select $1, unnest($2::text[])",
    [world.max.id, ["goggles", "beanie", "scarf"]],
  );
});

async function signIn(phone: string) {
  const jar = new FakeJar();
  const id = await deps.auth(jar).verifyCode(toE164(phone) as E164, "000000");
  if (!id) throw new Error("test sign-in failed");
  return jar;
}

async function put(id: string, body: unknown, jar?: FakeJar) {
  const handler = birdGearPut(createJsonRoute(async () => deps));
  const cookie = (jar?.getAll() ?? [])
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");
  const res = await handler(
    new NextRequest(`https://coo.test/api/birds/${id}/gear`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
  return { status: res.status, json: await res.json() };
}

async function gearOf(id: string): Promise<string[]> {
  const [row] = await deps.db.query<{ gear: string[] }>(
    "select gear from birds where id = $1",
    [id],
  );
  return row.gear;
}

async function addOutfit(userId: string, items: string[]) {
  const [row] = await deps.db.query<{ id: string }>(
    "insert into outfits (user_id, name, items) values ($1, 'Test', $2) returning id",
    [userId, items],
  );
  return row.id;
}

async function setBird(id: string, set: string, params: unknown[] = []) {
  await deps.db.query(`update birds set ${set} where id = $1`, [id, ...params]);
}

describe("PUT /api/birds/[id]/gear", () => {
  it("refuses a request without a session as 401", async () => {
    const { status, json } = await put(gerald, { items: ["goggles"] });
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
    expect(await gearOf(gerald)).toEqual([]);
  });

  it("putting on goggles then a beanie leaves only the beanie on the head slot (ac-1)", async () => {
    const jar = await signIn(MAX_PHONE);

    const first = await put(gerald, { items: ["goggles"] }, jar);
    const second = await put(gerald, { items: ["beanie"] }, jar);

    expect(first.status).toBe(200);
    expect(first.json.bird.gear).toEqual(["goggles"]);
    expect(second.status).toBe(200);
    expect(second.json.bird).toMatchObject({ id: gerald, gear: ["beanie"] });
    expect(await gearOf(gerald)).toEqual(["beanie"]);
  });

  it("refuses two head items in one request as 400 invalid", async () => {
    const jar = await signIn(MAX_PHONE);
    const { status, json } = await put(
      gerald,
      { items: ["goggles", "beanie"] },
      jar,
    );
    expect(status).toBe(400);
    expect(json.error.code).toBe("invalid");
    expect(await gearOf(gerald)).toEqual([]);
  });

  it("puts on an item another home bird wears and leaves it there", async () => {
    const jar = await signIn(MAX_PHONE);
    await put(brenda, { items: ["scarf", "bell"] }, jar);

    const { status, json } = await put(gerald, { items: ["scarf"] }, jar);

    expect(status).toBe(200);
    expect(json.bird.gear).toEqual(["scarf"]);
    expect(await gearOf(gerald)).toEqual(["scarf"]);
    expect(await gearOf(brenda)).toEqual(["scarf", "bell"]);
  });

  it("puts on an item a bird that is away wears and leaves it there", async () => {
    const jar = await signIn(MAX_PHONE);
    await put(brenda, { items: ["scarf"] }, jar);
    await setBird(brenda, "status = 'flying'");

    const { status, json } = await put(gerald, { items: ["scarf"] }, jar);

    expect(status).toBe(200);
    expect(json.bird.gear).toEqual(["scarf"]);
    expect(await gearOf(gerald)).toEqual(["scarf"]);
    expect(await gearOf(brenda)).toEqual(["scarf"]);
  });

  it("puts on an item a bird that is still busy wears and leaves it there", async () => {
    const jar = await signIn(MAX_PHONE);
    await put(brenda, { items: ["scarf"] }, jar);
    await setBird(
      brenda,
      "status = 'busy', busy_kind = 'job', busy_until = to_timestamp($2 / 1000.0)",
      [deps.clock.now() + HOUR],
    );

    const { status } = await put(gerald, { items: ["scarf"] }, jar);

    expect(status).toBe(200);
    expect(await gearOf(gerald)).toEqual(["scarf"]);
    expect(await gearOf(brenda)).toEqual(["scarf"]);
  });

  it("answers someone else's bird with 404 and leaves it unchanged", async () => {
    const jar = await signIn(MAX_PHONE);
    const [kevin] = world.priya.birds;
    await setBird(kevin.id, "gear = $2", [["bow"]]);

    const { status, json } = await put(kevin.id, { items: ["goggles"] }, jar);

    expect(status).toBe(404);
    expect(json.error.code).toBe("not_found");
    expect(await gearOf(kevin.id)).toEqual(["bow"]);
  });

  it("applies a saved outfit and lists the items it skipped (ac-3)", async () => {
    const jar = await signIn(MAX_PHONE);
    await put(brenda, { items: ["bow"] }, jar);
    const outfitId = await addOutfit(world.max.id, ["goggles", "bow", "band"]);

    const { status, json } = await put(gerald, { outfitId }, jar);

    expect(status).toBe(200);
    expect(json.bird.gear).toEqual(["goggles", "bow"]);
    expect(json.skipped).toEqual(["band"]);
    expect(await gearOf(gerald)).toEqual(["goggles", "bow"]);
    expect(await gearOf(brenda)).toEqual(["bow"]);
  });

  it("answers someone else's outfit with 404 and changes nothing", async () => {
    const jar = await signIn(MAX_PHONE);
    const outfitId = await addOutfit(world.priya.id, ["goggles"]);

    const { status, json } = await put(gerald, { outfitId }, jar);

    expect(status).toBe(404);
    expect(json.error.code).toBe("not_found");
    expect(await gearOf(gerald)).toEqual([]);
  });

  it.each([
    ["an empty body", {}],
    ["an outfit id that is not a uuid", { outfitId: "everyday" }],
    [
      "both items and an outfit id",
      { items: [], outfitId: "00000000-0000-4000-b000-000000000001" },
    ],
    ["items that is not a list", { items: "goggles" }],
    ["an item that is not text", { items: [7] }],
    ["an unknown key", { items: [], birdId: "x" }],
  ])("answers %s with 400 invalid", async (_, body) => {
    const jar = await signIn(MAX_PHONE);
    const { status, json } = await put(gerald, body, jar);
    expect(status).toBe(400);
    expect(json.error.code).toBe("invalid");
  });
});
