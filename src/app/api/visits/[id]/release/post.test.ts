import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { toE164, type E164 } from "@/lib/phone";
import { createJsonRoute } from "@/server/http";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { FakeJar } from "@/test/fakes/jar";
import { insertWaitingVisit } from "@/test/fixtures/visits";
import { seedWorld, type World } from "@/test/seedWorld";
import { visitReleasePost } from "./post";

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

async function leavesAt(): Promise<number> {
  const [row] = await deps.db.query<{ leaves_at: Date }>(
    "select leaves_at from visits where id = $1",
    [visitId],
  );
  return row.leaves_at.getTime();
}

async function post(id: string, jar?: FakeJar) {
  const handler = visitReleasePost(createJsonRoute(async () => deps));
  const cookie = (jar?.getAll() ?? [])
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");
  const res = await handler(
    new NextRequest(`https://coo.test/api/visits/${id}/release`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: "{}",
    }),
    { params: Promise.resolve({ id }) },
  );
  return { status: res.status, json: await res.json() };
}

describe("POST /api/visits/[id]/release", () => {
  it("refuses a request without a session as 401", async () => {
    const { status } = await post(visitId);
    expect(status).toBe(401);
  });

  it("persists leaves_at as now for the host (ac-1, ac-4)", async () => {
    deps.clock.advance(60_000);
    const now = deps.clock.now();
    expect(await leavesAt()).toBeGreaterThan(now);

    const { status, json } = await post(visitId, await signIn(PRIYA_PHONE));

    expect(status).toBe(200);
    expect(json.leavesAt).toBe(now);
    expect(await leavesAt()).toBe(now);
  });

  it.each([
    ["the owner", MAX_PHONE],
    ["a stranger", ROSA_PHONE],
  ])(
    "refuses %s as 404 not_found and keeps leaves_at (ac-4, ac-6)",
    async (_, phone) => {
      const before = await leavesAt();

      const { status, json } = await post(visitId, await signIn(phone));

      expect(status).toBe(404);
      expect(json.error.code).toBe("not_found");
      expect(await leavesAt()).toBe(before);
    },
  );

  it("refuses a visit that is over as 409 conflict", async () => {
    await deps.db.query("update visits set status = 'replied' where id = $1", [
      visitId,
    ]);
    const { status, json } = await post(visitId, await signIn(PRIYA_PHONE));
    expect(status).toBe(409);
    expect(json.error.code).toBe("conflict");
  });
});
