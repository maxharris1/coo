import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toE164, type E164 } from "@/lib/phone";
import { createJsonRoute } from "@/server/http";
import { tick } from "@/server/services/tick";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { FakeJar } from "@/test/fakes/jar";
import { seedWorld, type World } from "@/test/seedWorld";
import { syncGet } from "./get";

vi.mock("@/server/services/tick", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/services/tick")>();
  return { ...real, tick: vi.fn(real.tick) };
});

let deps: TestDeps;
let world: World;

beforeEach(async () => {
  vi.mocked(tick).mockClear();
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
});

async function signedInSync(phone: string) {
  const jar = new FakeJar();
  const id = await deps.auth(jar).verifyCode(toE164(phone) as E164, "000000");
  if (!id) throw new Error("test sign-in failed");
  const cookie = jar
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");
  const res = await syncGet(createJsonRoute(async () => deps))(
    new NextRequest("https://coo.test/api/sync", { headers: { cookie } }),
  );
  return { status: res.status, json: await res.json() };
}

describe("GET /api/sync runs the tick", () => {
  it("ticks for Max only and still returns his birds with empty flights and visits", async () => {
    const { status, json } = await signedInSync("+15550000001");

    expect(status).toBe(200);
    expect(json.birds.map((b: { name: string }) => b.name)).toEqual(
      world.max.birds.map((b) => b.name),
    );
    const priyaIds = world.priya.birds.map((b) => b.id);
    expect(
      json.birds.some((b: { id: string }) => priyaIds.includes(b.id)),
    ).toBe(false);
    expect(json.flights).toEqual([]);
    expect(json.visits).toEqual([]);
    expect(json.myVisiting).toEqual([]);

    expect(tick).toHaveBeenCalledTimes(1);
    expect(tick).toHaveBeenCalledWith(deps, { userId: world.max.id });
    for (const other of [world.priya.id, world.rosa.id]) {
      expect(tick).not.toHaveBeenCalledWith(expect.anything(), {
        userId: other,
      });
    }
  });
});
