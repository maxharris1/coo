import { beforeEach, describe, expect, it } from "vitest";
import type { UserId } from "@/server/ports/auth";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { insertNotification } from "@/test/fixtures/notifications";
import { seedWorld, type World } from "@/test/seedWorld";
import { listNotifications, markAllRead } from "./notifications";

let deps: TestDeps;
let world: World;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
});

async function seed(userId: string, count: number, startMs = deps.clock.now()) {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const { notificationId } = await insertNotification(
      deps.db,
      world,
      startMs + i * 1000,
      { userId, kind: "test", refId: null, title: `n${i}` },
    );
    ids.push(notificationId);
  }
  return ids;
}

async function unread(userId: string) {
  const [{ count }] = await deps.db.query<{ count: number }>(
    "select count(*)::int as count from notifications where user_id = $1 and read_at is null",
    [userId],
  );
  return count;
}

async function readAts(userId: string) {
  return deps.db.query<{ id: string; read_at: string | null }>(
    "select id, read_at::text from notifications where user_id = $1 order by id",
    [userId],
  );
}

const max = () => world.max.id as UserId;
const priya = () => world.priya.id as UserId;

describe("markAllRead", () => {
  it("zeroes Max's unread count and leaves Priya's untouched", async () => {
    await seed(world.max.id, 3);
    await seed(world.priya.id, 2);

    expect(await markAllRead(deps, max())).toEqual({ unread: 0 });

    expect(await unread(world.max.id)).toBe(0);
    expect(await unread(world.priya.id)).toBe(2);
  });

  it("zeroes Priya's unread count and leaves Max's untouched", async () => {
    await seed(world.max.id, 3);
    await seed(world.priya.id, 2);

    await markAllRead(deps, priya());

    expect(await unread(world.priya.id)).toBe(0);
    expect(await unread(world.max.id)).toBe(3);
  });

  it("stamps read_at from the clock and keeps the first stamp when repeated", async () => {
    await seed(world.max.id, 2);
    await markAllRead(deps, max());
    const first = await readAts(world.max.id);
    expect(first.every((r) => r.read_at !== null)).toBe(true);
    const [{ ms }] = await deps.db.query<{ ms: number }>(
      "select (extract(epoch from read_at) * 1000)::float8 as ms from notifications where user_id = $1 limit 1",
      [world.max.id],
    );
    expect(ms).toBe(deps.clock.now());

    deps.clock.advance(60_000);
    expect(await markAllRead(deps, max())).toEqual({ unread: 0 });

    expect(await readAts(world.max.id)).toEqual(first);
  });
});

describe("listNotifications", () => {
  it("returns only Max's notifications, newest first", async () => {
    const mine = await seed(world.max.id, 3);
    await seed(world.priya.id, 2);
    await seed(world.rosa.id, 1);

    const { notifications } = await listNotifications(deps, max());

    expect(notifications.map((n) => n.id)).toEqual([...mine].reverse());
    expect(notifications[0]).toEqual({
      id: mine[2],
      kind: "test",
      title: "n2",
      body: "Something happened",
      url: "/",
      createdAt: new Date(deps.clock.now() + 2000).toISOString(),
      read: false,
    });
  });

  it("returns the latest 50 when there are more", async () => {
    const mine = await seed(world.max.id, 55);

    const { notifications } = await listNotifications(deps, max());

    expect(notifications.map((n) => n.id)).toEqual(mine.slice(5).reverse());
  });

  it("reports read once marked", async () => {
    await seed(world.max.id, 2);
    await markAllRead(deps, max());

    const { notifications } = await listNotifications(deps, max());

    expect(notifications.map((n) => n.read)).toEqual([true, true]);
  });
});
