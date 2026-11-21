import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { toE164, type E164 } from "@/lib/phone";
import { createJsonRoute } from "@/server/http";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { FakeJar } from "@/test/fakes/jar";
import { insertWaitingVisit } from "@/test/fixtures/visits";
import { seedWorld, type World } from "@/test/seedWorld";
import { visitSnackPost } from "./post";

const MAX_PHONE = "+15550000001";
const PRIYA_PHONE = "+15550000002";
const ROSA_PHONE = "+15550000003";

let deps: TestDeps;
let world: World;
let visitId: string;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
  ({ visitId } = await insertWaitingVisit(deps.db, world, deps.clock.now()));
});

async function signIn(phone: string) {
  const jar = new FakeJar();
  const id = await deps.auth(jar).verifyCode(toE164(phone) as E164, "000000");
  if (!id) throw new Error("test sign-in failed");
  return jar;
}

async function post(id: string, jar?: FakeJar) {
  const handler = visitSnackPost(createJsonRoute(async () => deps));
  const cookie = (jar?.getAll() ?? [])
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");
  const res = await handler(
    new NextRequest(`https://coo.test/api/visits/${id}/snack`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: "{}",
    }),
    { params: Promise.resolve({ id }) },
  );
  return { status: res.status, json: await res.json() };
}

async function seedsOf(id: string): Promise<number> {
  const [row] = await deps.db.query<{ seeds: number }>(
    "select seeds from profiles where id = $1",
    [id],
  );
  return row.seeds;
}

describe("POST /api/visits/[id]/snack", () => {
  it("refuses a request without a session as 401", async () => {
    const { status } = await post(visitId);
    expect(status).toBe(401);
  });

  it("snacks the bird for the host and returns the new balance (ac-2)", async () => {
    const before = await seedsOf(world.priya.id);
    const { status, json } = await post(visitId, await signIn(PRIYA_PHONE));
    expect(status).toBe(200);
    expect(json.seeds).toBe(before - 5);
  });

  it("refuses a second snack as 409 conflict (ac-2)", async () => {
    const jar = await signIn(PRIYA_PHONE);
    await post(visitId, jar);
    const { status, json } = await post(visitId, jar);
    expect(status).toBe(409);
    expect(json.error.code).toBe("conflict");
  });

  it("is 402 insufficient_seeds with 4 seeds (ac-3)", async () => {
    await deps.db.query("update profiles set seeds = 4 where id = $1", [
      world.priya.id,
    ]);
    const { status, json } = await post(visitId, await signIn(PRIYA_PHONE));
    expect(status).toBe(402);
    expect(json.error.code).toBe("insufficient_seeds");
    expect(await seedsOf(world.priya.id)).toBe(4);
  });

  it.each([
    ["the owner", MAX_PHONE],
    ["a stranger", ROSA_PHONE],
  ])("refuses %s as 404 not_found", async (_, phone) => {
    const { status, json } = await post(visitId, await signIn(phone));
    expect(status).toBe(404);
    expect(json.error.code).toBe("not_found");
  });

  it("refuses a visit that is over as 409 conflict", async () => {
    deps.clock.advance(31 * 60_000);
    const { status, json } = await post(visitId, await signIn(PRIYA_PHONE));
    expect(status).toBe(409);
    expect(json.error.code).toBe("conflict");
  });
});
