import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { toE164, type E164 } from "@/lib/phone";
import { createJsonRoute } from "@/server/http";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { FakeJar } from "@/test/fakes/jar";
import { seedWorld, type World } from "@/test/seedWorld";
import { birdPatch } from "./patch";

const MAX_PHONE = "+15550000001";

let deps: TestDeps;
let world: World;
let gerald: string;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
  gerald = world.max.birds[0].id;
  await setBird(gerald, "name = 'Gerald', pronoun = 'he'");
});

async function signIn(phone: string) {
  const jar = new FakeJar();
  const id = await deps.auth(jar).verifyCode(toE164(phone) as E164, "000000");
  if (!id) throw new Error("test sign-in failed");
  return jar;
}

async function patch(id: string, body: unknown, jar?: FakeJar) {
  const handler = birdPatch(createJsonRoute(async () => deps));
  const cookie = (jar?.getAll() ?? [])
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");
  const res = await handler(
    new NextRequest(`https://coo.test/api/birds/${id}`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
  return { status: res.status, json: await res.json() };
}

async function setBird(id: string, set: string, params: unknown[] = []) {
  await deps.db.query(`update birds set ${set} where id = $1`, [id, ...params]);
}

async function birdRow(id: string) {
  const [row] = await deps.db.query<{
    name: string;
    pronoun: string;
    status: string;
  }>("select name, pronoun, status from birds where id = $1", [id]);
  return row;
}

describe("PATCH /api/birds/[id] (ac-5)", () => {
  it("renames my home bird and changes its pronoun", async () => {
    const jar = await signIn(MAX_PHONE);

    const { status, json } = await patch(
      gerald,
      { name: "Gus", pronoun: "she" },
      jar,
    );

    expect(status).toBe(200);
    expect(json.bird).toMatchObject({
      id: gerald,
      name: "Gus",
      pronoun: "she",
    });
    expect(await birdRow(gerald)).toEqual({
      name: "Gus",
      pronoun: "she",
      status: "home",
    });
  });

  it("renames my bird while it is flying", async () => {
    const jar = await signIn(MAX_PHONE);
    await setBird(gerald, "status = 'flying'");

    const { status, json } = await patch(gerald, { name: "Gus" }, jar);

    expect(status).toBe(200);
    expect(json.bird).toMatchObject({ name: "Gus", status: "flying" });
    expect(await birdRow(gerald)).toEqual({
      name: "Gus",
      pronoun: "he",
      status: "flying",
    });
  });

  it("renames my bird while it is busy", async () => {
    const jar = await signIn(MAX_PHONE);
    const until = new Date(deps.clock.now() + 60_000);
    await setBird(
      gerald,
      "status = 'busy', busy_kind = 'job', busy_until = $2",
      [until],
    );

    const { status, json } = await patch(gerald, { name: "Gus" }, jar);

    expect(status).toBe(200);
    expect(json.bird).toMatchObject({ name: "Gus", status: "busy" });
    expect((await birdRow(gerald)).name).toBe("Gus");
  });

  it("changes only the name when only a name is sent, trimmed", async () => {
    const jar = await signIn(MAX_PHONE);

    const { status, json } = await patch(gerald, { name: "  Gus  " }, jar);

    expect(status).toBe(200);
    expect(json.bird).toMatchObject({ name: "Gus", pronoun: "he" });
    expect(await birdRow(gerald)).toMatchObject({ name: "Gus", pronoun: "he" });
  });

  it("changes only the pronoun when only a pronoun is sent", async () => {
    const jar = await signIn(MAX_PHONE);

    const { status, json } = await patch(gerald, { pronoun: "they" }, jar);

    expect(status).toBe(200);
    expect(json.bird).toMatchObject({ name: "Gerald", pronoun: "they" });
    expect(await birdRow(gerald)).toMatchObject({
      name: "Gerald",
      pronoun: "they",
    });
  });

  it("accepts a 24 code point name made of characters outside the BMP", async () => {
    const jar = await signIn(MAX_PHONE);
    const name = "\u{1F426}".repeat(24);

    const { status } = await patch(gerald, { name }, jar);

    expect(status).toBe(200);
    expect((await birdRow(gerald)).name).toBe(name);
  });

  it("gives the same result when the same rename is sent twice", async () => {
    const jar = await signIn(MAX_PHONE);
    const body = { name: "Gus", pronoun: "she" };

    const first = await patch(gerald, body, jar);
    const second = await patch(gerald, body, jar);

    expect([first.status, second.status]).toEqual([200, 200]);
    expect(second.json.bird).toEqual(first.json.bird);
  });

  it("answers someone else's bird with 404 and leaves it unchanged", async () => {
    const jar = await signIn(MAX_PHONE);
    const kevin = world.priya.birds[0].id;
    const before = await birdRow(kevin);

    const { status, json } = await patch(
      kevin,
      { name: "Gus", pronoun: "she" },
      jar,
    );

    expect(status).toBe(404);
    expect(json.error).toMatchObject({
      code: "not_found",
      message: "Could not find that bird.",
    });
    expect(await birdRow(kevin)).toEqual(before);
  });

  it("refuses a request without a session as 401", async () => {
    const { status, json } = await patch(gerald, { name: "Gus" });

    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
    expect((await birdRow(gerald)).name).toBe("Gerald");
  });

  it.each([
    ["an empty body", {}],
    ["a 25 code point name", { name: "a".repeat(25) }],
    ["a blank name", { name: "   " }],
    ["a name with a NUL", { name: "Gu\u0000s" }],
    ["an unknown key", { name: "Gus", look: "kevin" }],
    ["an invalid pronoun", { pronoun: "it" }],
  ])("refuses %s with 400 invalid and writes nothing", async (_, body) => {
    const jar = await signIn(MAX_PHONE);

    const { status, json } = await patch(gerald, body, jar);

    expect(status).toBe(400);
    expect(json.error.code).toBe("invalid");
    expect(await birdRow(gerald)).toEqual({
      name: "Gerald",
      pronoun: "he",
      status: "home",
    });
  });
});
