import { beforeEach, describe, expect, it } from "vitest";
import { syncGet } from "@/app/api/sync/get";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import type { FakeJar } from "@/test/fakes/jar";
import { insertNotification } from "@/test/fixtures/notifications";
import { geoClient } from "@/test/geoRoute";
import { seedWorld, type World } from "@/test/seedWorld";
import { notificationsReadPost } from "./post";

const MAX_PHONE = "+15550000001";
const PRIYA_PHONE = "+15550000002";

let deps: TestDeps;
let world: World;
let client: ReturnType<typeof geoClient>;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
  client = geoClient(deps, notificationsReadPost, "/api/notifications/read");
});

async function seed(userId: string, count: number) {
  for (let i = 0; i < count; i++) {
    await insertNotification(deps.db, world, deps.clock.now() + i, {
      userId,
      kind: "test",
      refId: null,
    });
  }
}

async function unread(jar: FakeJar): Promise<number> {
  const { status, json } = await geoClient(deps, syncGet, "/api/sync").get(
    {},
    jar,
  );
  expect(status).toBe(200);
  return json.unread;
}

describe("POST /api/notifications/read", () => {
  it("refuses a request without a session as 401 and marks nothing", async () => {
    await seed(world.max.id, 2);
    const { status, json } = await client.post({});
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
    expect(await unread((await client.signIn(MAX_PHONE)).jar)).toBe(2);
  });

  it("zeroes Max's unread in /api/sync and leaves Priya's unchanged", async () => {
    await seed(world.max.id, 3);
    await seed(world.priya.id, 2);
    const max = await client.signIn(MAX_PHONE);
    const priya = await client.signIn(PRIYA_PHONE);
    expect(await unread(max.jar)).toBe(3);

    const { status, json } = await client.post({}, max.jar);

    expect(status).toBe(200);
    expect(json.unread).toBe(0);
    expect(await unread(max.jar)).toBe(0);
    expect(await unread(priya.jar)).toBe(2);
  });

  it("answers a repeat with 200 and changes nothing", async () => {
    await seed(world.max.id, 2);
    await seed(world.priya.id, 1);
    const max = await client.signIn(MAX_PHONE);
    await client.post({}, max.jar);
    const before = await deps.db.query(
      "select id, read_at::text from notifications order by id",
    );
    deps.clock.advance(60_000);

    const again = await client.post({}, max.jar);

    expect(again.status).toBe(200);
    expect(
      await deps.db.query(
        "select id, read_at::text from notifications order by id",
      ),
    ).toEqual(before);
  });
});
