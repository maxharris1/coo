import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import { toE164, type E164 } from "@/lib/phone";
import { createJsonRoute } from "@/server/http";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { FakeJar } from "@/test/fakes/jar";
import { seedWorld, type World } from "@/test/seedWorld";
import { birdCarePost, type CareAction } from "./carePost";

const MAX_PHONE = "+15550000001";
const MINUTE = 60_000;
const ACTIONS: CareAction[] = ["feed", "bath", "nap"];

let deps: TestDeps;
let world: World;
let gerald: string;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
  gerald = world.max.birds[0].id;
});

async function signIn(phone: string) {
  const jar = new FakeJar();
  const id = await deps.auth(jar).verifyCode(toE164(phone) as E164, "000000");
  if (!id) throw new Error("test sign-in failed");
  return jar;
}

async function post(
  action: CareAction,
  id: string,
  jar?: FakeJar,
  body: unknown = action === "feed" ? { actionId: crypto.randomUUID() } : null,
) {
  const handler = birdCarePost(
    createJsonRoute(async () => deps),
    action,
  );
  const cookie = (jar?.getAll() ?? [])
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");
  const res = await handler(
    new NextRequest(`https://coo.test/api/birds/${id}/${action}`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: body === null ? undefined : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
  return { status: res.status, json: await res.json() };
}

async function setBird(id: string, set: string, params: unknown[] = []) {
  await deps.db.query(`update birds set ${set} where id = $1`, [id, ...params]);
}

async function setSeeds(userId: string, seeds: number) {
  await deps.db.query("update profiles set seeds = $2 where id = $1", [
    userId,
    seeds,
  ]);
}

async function birdRow(id: string) {
  const [row] = await deps.db.query<{
    belly: number;
    status: string;
    busy_kind: string | null;
    busy_until: Date | null;
  }>("select belly, status, busy_kind, busy_until from birds where id = $1", [
    id,
  ]);
  return row;
}

async function seedsOf(userId: string) {
  const [row] = await deps.db.query<{ seeds: number }>(
    "select seeds from profiles where id = $1",
    [userId],
  );
  return row.seeds;
}

async function ledger(userId: string, reason: string) {
  return deps.db.query<{ delta: number }>(
    "select delta from seed_ledger where user_id = $1 and reason = $2",
    [userId, reason],
  );
}

describe("POST /api/birds/[id]/feed", () => {
  it("spends 3 seeds and adds 50 belly (ac-1)", async () => {
    const jar = await signIn(MAX_PHONE);
    await setBird(gerald, "belly = 40");
    await setSeeds(world.max.id, 10);

    const { status, json } = await post("feed", gerald, jar);

    expect(config.game.seeds.feedCost).toBe(3);
    expect(status).toBe(200);
    expect(json.bird).toMatchObject({ id: gerald, belly: 90 });
    expect(json.seeds).toBe(7);
    expect(await seedsOf(world.max.id)).toBe(7);
    expect(await ledger(world.max.id, "feed")).toEqual([{ delta: -3 }]);
    expect((await birdRow(gerald)).belly).toBe(90);
  });

  it("caps belly at 100 (ac-1)", async () => {
    const jar = await signIn(MAX_PHONE);
    await setBird(gerald, "belly = 80");

    const { status, json } = await post("feed", gerald, jar);

    expect(status).toBe(200);
    expect(json.bird.belly).toBe(100);
  });

  it("refuses with insufficient_seeds when only 2 seeds are left (ac-1)", async () => {
    const jar = await signIn(MAX_PHONE);
    await setBird(gerald, "belly = 40");
    await setSeeds(world.max.id, 2);

    const { status, json } = await post("feed", gerald, jar);

    expect(status).toBe(402);
    expect(json.error.code).toBe("insufficient_seeds");
    expect(await seedsOf(world.max.id)).toBe(2);
    expect((await birdRow(gerald)).belly).toBe(40);
    expect(await ledger(world.max.id, "feed")).toEqual([]);
  });
});

describe("POST /api/birds/[id]/feed retries", () => {
  it("replaying a committed feed must not charge twice", async () => {
    const jar = await signIn(MAX_PHONE);
    await setSeeds(world.max.id, 10);
    await setBird(gerald, "belly = 40");
    const body = { actionId: crypto.randomUUID() };
    const first = await post("feed", gerald, jar, body);
    expect(first.status).toBe(200);
    const committed = {
      seeds: await seedsOf(world.max.id),
      belly: (await birdRow(gerald)).belly,
      ledger: await ledger(world.max.id, "feed"),
    };

    const replay = await post("feed", gerald, jar, body);

    expect(replay.status).toBe(200);
    expect(replay.json.seeds).toBe(first.json.seeds);
    expect(replay.json.bird).toEqual(first.json.bird);
    expect({
      seeds: await seedsOf(world.max.id),
      belly: (await birdRow(gerald)).belly,
      ledger: await ledger(world.max.id, "feed"),
    }).toEqual(committed);
    expect(committed).toEqual({
      seeds: 7,
      belly: 90,
      ledger: [{ delta: -3 }],
    });
  });

  it("replays a committed feed even when the seeds have since run out", async () => {
    const jar = await signIn(MAX_PHONE);
    await setSeeds(world.max.id, 3);
    await setBird(gerald, "belly = 40");
    const body = { actionId: crypto.randomUUID() };
    expect((await post("feed", gerald, jar, body)).status).toBe(200);

    const replay = await post("feed", gerald, jar, body);

    expect(replay.status).toBe(200);
    expect(replay.json).toMatchObject({ seeds: 0, bird: { belly: 90 } });
    expect(await ledger(world.max.id, "feed")).toEqual([{ delta: -3 }]);
  });

  it("counts two deliberate feeds with different action ids", async () => {
    const jar = await signIn(MAX_PHONE);
    await setSeeds(world.max.id, 10);
    await setBird(gerald, "belly = 20");

    const first = await post("feed", gerald, jar);
    const second = await post("feed", gerald, jar);

    expect([first.status, second.status]).toEqual([200, 200]);
    expect(second.json).toMatchObject({ seeds: 4, bird: { belly: 100 } });
    expect(await seedsOf(world.max.id)).toBe(4);
    expect((await birdRow(gerald)).belly).toBe(100);
    expect(await ledger(world.max.id, "feed")).toEqual([
      { delta: -3 },
      { delta: -3 },
    ]);
  });

  it.each([
    ["missing", {}],
    ["not a uuid", { actionId: "tap-1" }],
  ])("refuses a feed whose action id is %s", async (_, body) => {
    const jar = await signIn(MAX_PHONE);
    const seeds = await seedsOf(world.max.id);
    await setBird(gerald, "belly = 40");

    const { status, json } = await post("feed", gerald, jar, body);

    expect(status).toBe(400);
    expect(json.error.code).toBe("invalid");
    expect(await seedsOf(world.max.id)).toBe(seeds);
    expect((await birdRow(gerald)).belly).toBe(40);
  });

  it("answers a replayed action id on someone else's bird with 404", async () => {
    const jar = await signIn(MAX_PHONE);
    const body = { actionId: crypto.randomUUID() };
    expect((await post("feed", gerald, jar, body)).status).toBe(200);

    const { status, json } = await post(
      "feed",
      world.priya.birds[0].id,
      jar,
      body,
    );

    expect(status).toBe(404);
    expect(json.error.code).toBe("not_found");
  });
});

describe.each([
  ["bath", config.game.care.bathMinutes, 10],
  ["nap", config.game.care.napMinutes, 30],
] as const)("POST /api/birds/[id]/%s", (action, minutes, expected) => {
  it(`makes the bird busy for ${expected} minutes and unable to fly (ac-2)`, async () => {
    const jar = await signIn(MAX_PHONE);
    const seeds = await seedsOf(world.max.id);
    const now = deps.clock.now();

    const { status, json } = await post(action, gerald, jar);

    expect(minutes).toBe(expected);
    expect(status).toBe(200);
    expect(json.bird).toMatchObject({
      id: gerald,
      status: "busy",
      busyKind: action,
      busyUntil: now + expected * MINUTE,
      canFly: false,
      cannotFlyReason: "busy",
    });
    expect(json.seeds).toBe(seeds);
    expect(await seedsOf(world.max.id)).toBe(seeds);
    expect(await birdRow(gerald)).toMatchObject({
      status: "busy",
      busy_kind: action,
      busy_until: new Date(now + expected * MINUTE),
    });
  });
});

describe.each(ACTIONS)("POST /api/birds/[id]/%s refusals (ac-5)", (action) => {
  it("refuses a request without a session as 401", async () => {
    const { status, json } = await post(action, gerald);
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
    expect((await birdRow(gerald)).status).toBe("home");
  });

  it("answers someone else's bird with 404 and leaves it unchanged", async () => {
    const jar = await signIn(MAX_PHONE);
    const kevin = world.priya.birds[0].id;
    await setBird(kevin, "belly = 40");
    const seeds = await seedsOf(world.max.id);

    const { status, json } = await post(action, kevin, jar);

    expect(status).toBe(404);
    expect(json.error.code).toBe("not_found");
    expect(await birdRow(kevin)).toMatchObject({ belly: 40, status: "home" });
    expect(await seedsOf(world.max.id)).toBe(seeds);
  });

  it.each(["flying", "visiting", "scheduled"])(
    "refuses a %s bird with 409 conflict",
    async (away) => {
      const jar = await signIn(MAX_PHONE);
      await setBird(gerald, `status = '${away}', belly = 40`);
      const seeds = await seedsOf(world.max.id);

      const { status, json } = await post(action, gerald, jar);

      expect(status).toBe(409);
      expect(json.error.code).toBe("conflict");
      expect(await birdRow(gerald)).toMatchObject({ belly: 40, status: away });
      expect(await seedsOf(world.max.id)).toBe(seeds);
    },
  );

  it("refuses a bird that is still busy with 409 conflict", async () => {
    const jar = await signIn(MAX_PHONE);
    const until = new Date(deps.clock.now() + MINUTE);
    await setBird(
      gerald,
      "status = 'busy', busy_kind = 'job', busy_until = $2",
      [until],
    );

    const { status, json } = await post(action, gerald, jar);

    expect(status).toBe(409);
    expect(json.error.code).toBe("conflict");
    expect(await birdRow(gerald)).toMatchObject({
      status: "busy",
      busy_kind: "job",
      busy_until: until,
    });
  });
});

describe("care on a bird whose bath has ended", () => {
  it("settles the bath first, then accepts the action", async () => {
    const jar = await signIn(MAX_PHONE);
    await setBird(gerald, "feathers = 40");
    await post("bath", gerald, jar);
    deps.clock.advance(config.game.care.bathMinutes * MINUTE);

    const { status, json } = await post("feed", gerald, jar);

    expect(status).toBe(200);
    expect(json.bird).toMatchObject({ status: "home", feathers: 100 });
    expect(json.bird.busyKind).toBeNull();
  });
});
