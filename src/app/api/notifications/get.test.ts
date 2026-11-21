import { beforeEach, describe, expect, it } from "vitest";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { insertNotification } from "@/test/fixtures/notifications";
import { geoClient } from "@/test/geoRoute";
import { seedWorld, type World } from "@/test/seedWorld";
import { notificationsGet } from "./get";

const MAX_PHONE = "+15550000001";

let deps: TestDeps;
let world: World;
let client: ReturnType<typeof geoClient>;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
  client = geoClient(deps, notificationsGet, "/api/notifications");
});

const seed = async (userId: string, refId: string | null = null) =>
  (
    await insertNotification(deps.db, world, deps.clock.now(), {
      userId,
      kind: "test",
      refId,
    })
  ).notificationId;

describe("GET /api/notifications", () => {
  it("refuses a request without a session as 401", async () => {
    await seed(world.max.id);
    const { status, json } = await client.get({});
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
  });

  it("returns Max's notifications and none of Priya's or Rosa's", async () => {
    const mine = await seed(world.max.id);
    const others = [await seed(world.priya.id), await seed(world.rosa.id)];
    const { jar } = await client.signIn(MAX_PHONE);

    const { status, json } = await client.get({}, jar);

    expect(status).toBe(200);
    expect(json.notifications.map((n: { id: string }) => n.id)).toEqual([mine]);
    const body = JSON.stringify(json);
    for (const id of [...others, world.priya.id, world.rosa.id]) {
      expect(body).not.toContain(id);
    }
  });

  it("hides ref_id from the list", async () => {
    const refId = "00000000-0000-4000-c000-000000000099";
    await seed(world.max.id, refId);
    const { jar } = await client.signIn(MAX_PHONE);

    const { json } = await client.get({}, jar);

    expect(JSON.stringify(json)).not.toContain(refId);
  });
});
