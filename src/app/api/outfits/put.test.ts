import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { toE164, type E164 } from "@/lib/phone";
import { createJsonRoute } from "@/server/http";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { FakeJar } from "@/test/fakes/jar";
import { seedWorld, type World } from "@/test/seedWorld";
import { outfitsPut } from "./put";

const MAX_PHONE = "+15550000001";

let deps: TestDeps;
let world: World;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
});

async function signIn(phone: string) {
  const jar = new FakeJar();
  const id = await deps.auth(jar).verifyCode(toE164(phone) as E164, "000000");
  if (!id) throw new Error("test sign-in failed");
  return jar;
}

async function put(body: unknown, jar?: FakeJar) {
  const handler = outfitsPut(createJsonRoute(async () => deps));
  const cookie = (jar?.getAll() ?? [])
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");
  const res = await handler(
    new NextRequest("https://coo.test/api/outfits", {
      method: "PUT",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: await res.json() };
}

async function outfitsOf(userId: string) {
  return deps.db.query<{ id: string; name: string; items: string[] }>(
    "select id, name, items from outfits where user_id = $1 order by position, id",
    [userId],
  );
}

describe("PUT /api/outfits", () => {
  it("refuses a request without a session as 401", async () => {
    const before = await outfitsOf(world.max.id);
    const { status, json } = await put({ outfits: [] });
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
    expect(await outfitsOf(world.max.id)).toEqual(before);
  });

  it("saves the outfits and returns them in order", async () => {
    const jar = await signIn(MAX_PHONE);
    const [everyday] = await outfitsOf(world.max.id);

    const { status, json } = await put(
      {
        outfits: [
          { name: " Rainy ", items: ["rainhat", "scarf"] },
          { id: everyday.id, name: "Everyday", items: ["bow"] },
        ],
      },
      jar,
    );

    expect(status).toBe(200);
    expect(json.outfits).toEqual([
      { id: expect.any(String), name: "Rainy", items: ["rainhat", "scarf"] },
      { id: everyday.id, name: "Everyday", items: ["bow"] },
    ]);
    expect(await outfitsOf(world.max.id)).toEqual(json.outfits);
  });

  it("gives the same rows when the same save runs twice", async () => {
    const jar = await signIn(MAX_PHONE);
    const first = await put(
      { outfits: [{ name: "Cap", items: ["cap"] }] },
      jar,
    );
    const second = await put({ outfits: first.json.outfits }, jar);

    expect(second.status).toBe(200);
    expect(second.json.outfits).toEqual(first.json.outfits);
    expect(await outfitsOf(world.max.id)).toEqual(first.json.outfits);
  });

  it("answers someone else's outfit id with 404 and leaves it unchanged", async () => {
    const jar = await signIn(MAX_PHONE);
    const theirs = await outfitsOf(world.priya.id);

    const { status, json } = await put(
      { outfits: [{ id: theirs[0].id, name: "Mine", items: [] }] },
      jar,
    );

    expect(status).toBe(404);
    expect(json.error.code).toBe("not_found");
    expect(await outfitsOf(world.priya.id)).toEqual(theirs);
  });

  it.each([
    [
      "seven outfits",
      {
        outfits: Array.from({ length: 7 }, (_, i) => ({
          name: `O${i}`,
          items: [],
        })),
      },
    ],
    [
      "two items on one slot",
      { outfits: [{ name: "Bad", items: ["goggles", "beanie"] }] },
    ],
    ["an empty name", { outfits: [{ name: "  ", items: [] }] }],
    [
      "a name over 20 letters",
      { outfits: [{ name: "x".repeat(21), items: [] }] },
    ],
    [
      "an id that is not a uuid",
      { outfits: [{ id: "1", name: "A", items: [] }] },
    ],
    ["an unknown key", { outfits: [], extra: true }],
  ])("answers %s with 400 invalid", async (_, body) => {
    const jar = await signIn(MAX_PHONE);
    const before = await outfitsOf(world.max.id);
    const { status, json } = await put(body, jar);
    expect(status).toBe(400);
    expect(json.error.code).toBe("invalid");
    expect(await outfitsOf(world.max.id)).toEqual(before);
  });
});
