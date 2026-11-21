import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { seedWorld, type World } from "@/test/seedWorld";
import { notify, type NotifyRow } from "./notify";
import { deliver } from "./notify/deliver";

vi.mock("./notify/deliver", () => ({
  deliver: vi.fn(async () => ({ pushed: false })),
}));

let deps: TestDeps;
let world: World;

beforeEach(async () => {
  vi.mocked(deliver).mockClear();
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
});

function row(refId: string): NotifyRow {
  return {
    userId: world.max.id,
    kind: "landed",
    refId,
    title: "Gerald landed",
    body: "Your note reached Priya",
  };
}

async function count(table: "notifications" | "events") {
  const [{ n }] = await deps.db.query<{ n: number }>(
    `select count(*)::int as n from ${table} where user_id = $1`,
    [world.max.id],
  );
  return n;
}

describe("notify", () => {
  it("inserts one notification and one event when called twice with the same key", async () => {
    const refId = crypto.randomUUID();
    const first = await notify(deps, row(refId));
    const second = await notify(deps, row(refId));

    expect(first).toEqual({ id: expect.any(String) });
    expect(second).toBeNull();
    expect(await count("notifications")).toBe(1);
    expect(await count("events")).toBe(1);
  });

  it("runs deliver on a fresh insert only, not on a repeat", async () => {
    const refId = crypto.randomUUID();
    const first = await notify(deps, row(refId));
    await notify(deps, row(refId));

    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver).toHaveBeenCalledWith(deps, first?.id);
  });

  it("adds a second notification, event and delivery for a different refId", async () => {
    const first = await notify(deps, row(crypto.randomUUID()));
    const second = await notify(deps, row(crypto.randomUUID()));

    expect(second?.id).not.toBe(first?.id);
    expect(await count("notifications")).toBe(2);
    expect(await count("events")).toBe(2);
    expect(deliver).toHaveBeenCalledTimes(2);
    expect(deliver).toHaveBeenLastCalledWith(deps, second?.id);
  });

  it("stores the row with the clock's time and url defaulting to /", async () => {
    const { id } = (await notify(deps, row(crypto.randomUUID())))!;
    const [stored] = await deps.db.query<{
      url: string;
      kind: string;
      created_at: Date;
    }>("select url, kind, created_at from notifications where id = $1", [id]);
    const [event] = await deps.db.query<{ kind: string; created_at: Date }>(
      "select kind, created_at from events where user_id = $1",
      [world.max.id],
    );

    expect(stored.url).toBe("/");
    expect(stored.created_at.getTime()).toBe(deps.clock.now());
    expect(event).toEqual({
      kind: "notification",
      created_at: new Date(deps.clock.now()),
    });
  });
});
