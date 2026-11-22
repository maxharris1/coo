import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import { toE164, type E164 } from "@/lib/phone";
import { createJsonRoute } from "@/server/http";
import type { UserId } from "@/server/ports/auth";
import { send } from "@/server/services/flights/send";
import { tick } from "@/server/services/tick";
import { moodLine } from "@/app/(app)/birds/[id]/pigeon";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { FakeJar } from "@/test/fakes/jar";
import { seedWorld, type World } from "@/test/seedWorld";
import { birdCarePost, type CareAction } from "../carePost";
import { birdWakePost } from "./post";

const MAX_PHONE = "+15550000001";
const MINUTE = 60_000;
const { napMinutes, napEnergy, energyHomePerHour } = config.game.care;

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

async function call(
  handler: ReturnType<typeof birdWakePost>,
  path: string,
  id: string,
  jar?: FakeJar,
  body: unknown = null,
) {
  const cookie = (jar?.getAll() ?? [])
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");
  const res = await handler(
    new NextRequest(`https://coo.test/api/birds/${id}/${path}`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: body === null ? undefined : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
  return { status: res.status, json: await res.json() };
}

function wake(id: string, jar?: FakeJar) {
  return call(birdWakePost(createJsonRoute(async () => deps)), "wake", id, jar);
}

function care(action: CareAction, id: string, jar: FakeJar) {
  const body = action === "feed" ? { actionId: crypto.randomUUID() } : null;
  return call(
    birdCarePost(
      createJsonRoute(async () => deps),
      action,
    ),
    action,
    id,
    jar,
    body,
  );
}

async function setBird(id: string, set: string, params: unknown[] = []) {
  await deps.db.query(`update birds set ${set} where id = $1`, [id, ...params]);
}

async function birdRow(id: string) {
  const [row] = await deps.db.query<{
    energy: number;
    status: string;
    busy_kind: string | null;
    busy_until: Date | null;
    care_at: Date;
  }>(
    "select energy, status, busy_kind, busy_until, care_at from birds where id = $1",
    [id],
  );
  return row;
}

async function fullRow(id: string) {
  const [row] = await deps.db.query("select * from birds where id = $1", [id]);
  return row;
}

function sendGerald() {
  return send(deps, world.max.id as UserId, {
    body: "Bring the good bagels on Sunday",
    sends: [{ friendId: world.priya.id as UserId, birdId: gerald }],
  });
}

async function napWith(energy: number, jar: FakeJar) {
  await setBird(gerald, "energy = $2, care_at = $3", [
    energy,
    new Date(deps.clock.now()),
  ]);
  const nap = await care("nap", gerald, jar);
  expect(nap.status).toBe(200);
}

describe("POST /api/birds/[id]/wake on an in-progress nap (ac-1)", () => {
  it("sets the bird home with no nap energy", async () => {
    const jar = await signIn(MAX_PHONE);
    await napWith(20, jar);
    deps.clock.advance(10 * MINUTE);
    const accrued = 20 + (energyHomePerHour * 10) / 60;

    const { status, json } = await wake(gerald, jar);

    expect(status).toBe(200);
    expect(json.bird).toMatchObject({
      id: gerald,
      status: "home",
      busyKind: null,
      busyUntil: null,
      canFly: true,
    });
    expect(json.bird.energy).toBeCloseTo(accrued, 1);
    const row = await birdRow(gerald);
    expect(row).toMatchObject({
      status: "home",
      busy_kind: null,
      busy_until: null,
    });
    expect(row.energy).toBeCloseTo(accrued, 1);
    expect(row.energy).toBeLessThan(20 + napEnergy);
  });

  it("then follows ordinary home rules for feed, bath and send", async () => {
    const jar = await signIn(MAX_PHONE);
    await napWith(60, jar);
    deps.clock.advance(5 * MINUTE);
    expect((await wake(gerald, jar)).status).toBe(200);

    expect((await care("feed", gerald, jar)).status).toBe(200);
    expect((await care("bath", gerald, jar)).status).toBe(200);
    deps.clock.advance(config.game.care.bathMinutes * MINUTE);
    await tick(deps);
    const { flights } = await sendGerald();

    expect(flights).toHaveLength(1);
    expect((await birdRow(gerald)).status).toBe("flying");
  });

  it("leaves a still-tired bird unable to be released", async () => {
    const jar = await signIn(MAX_PHONE);
    await napWith(5, jar);
    deps.clock.advance(10 * MINUTE);

    const { status, json } = await wake(gerald, jar);

    expect(status).toBe(200);
    expect(json.bird).toMatchObject({
      status: "home",
      canFly: false,
      cannotFlyReason: "tired",
    });
    await expect(sendGerald()).rejects.toMatchObject({ code: "conflict" });
    expect((await birdRow(gerald)).status).toBe("home");
  });

  it("warns a still-tired hungry bird that it cannot fly", async () => {
    const jar = await signIn(MAX_PHONE);
    await setBird(gerald, "belly = $2", [10]);
    await napWith(5, jar);
    deps.clock.advance(10 * MINUTE);

    const { status, json } = await wake(gerald, jar);

    expect(status).toBe(200);
    expect(json.bird).toMatchObject({
      hungry: true,
      tired: true,
      canFly: false,
      cannotFlyReason: "tired",
    });
    expect(moodLine(json.bird)).toBe(
      "Too tired to fly. They need a nap first.",
    );
  });
});

describe("POST /api/birds/[id]/wake on a due nap (ac-2)", () => {
  it("applies the nap's energy and sets the bird home", async () => {
    const jar = await signIn(MAX_PHONE);
    await napWith(20, jar);
    const start = deps.clock.now();
    deps.clock.advance((napMinutes + 5) * MINUTE);

    const { status, json } = await wake(gerald, jar);

    expect(status).toBe(200);
    expect(json.bird).toMatchObject({
      status: "home",
      busyKind: null,
      busyUntil: null,
    });
    const atEnd = 20 + (energyHomePerHour * napMinutes) / 60 + napEnergy;
    const row = await birdRow(gerald);
    expect(row).toMatchObject({
      status: "home",
      busy_kind: null,
      busy_until: null,
      care_at: new Date(start + napMinutes * MINUTE),
    });
    expect(row.energy).toBeCloseTo(atEnd, 1);
    expect(json.bird.energy).toBeCloseTo(
      atEnd + (energyHomePerHour * 5) / 60,
      1,
    );
  });

  it("answers a second wake with 409 and writes nothing", async () => {
    const jar = await signIn(MAX_PHONE);
    await napWith(20, jar);
    deps.clock.advance(MINUTE);
    expect((await wake(gerald, jar)).status).toBe(200);
    const before = await fullRow(gerald);

    const { status, json } = await wake(gerald, jar);

    expect(status).toBe(409);
    expect(json.error.code).toBe("conflict");
    expect(json.error.message).toMatch(/is not napping/);
    expect(await fullRow(gerald)).toEqual(before);
  });
});

describe("POST /api/birds/[id]/wake refusals (ac-3)", () => {
  it.each([
    ["bathing", "status = 'busy', busy_kind = 'bath', busy_until = $2"],
    ["on an odd job", "status = 'busy', busy_kind = 'job', busy_until = $2"],
    ["scheduled", "status = 'scheduled'"],
    ["flying or roosting", "status = 'flying'"],
    ["visiting", "status = 'visiting'"],
    ["home and only tired", "energy = 20"],
  ])("refuses a bird that is %s with 409 and no write", async (_, set) => {
    const jar = await signIn(MAX_PHONE);
    const until = new Date(deps.clock.now() + 10 * MINUTE);
    await setBird(gerald, set, set.includes("$2") ? [until] : []);
    const before = await fullRow(gerald);

    const { status, json } = await wake(gerald, jar);

    expect(status).toBe(409);
    expect(json.error.code).toBe("conflict");
    expect(await fullRow(gerald)).toEqual(before);
  });

  it("answers someone else's napping bird with 404 and leaves it napping", async () => {
    const jar = await signIn(MAX_PHONE);
    const kevin = world.priya.birds[0].id;
    await setBird(kevin, "status = 'busy', busy_kind = 'nap', busy_until = $2", [
      new Date(deps.clock.now() + 10 * MINUTE),
    ]);
    const before = await fullRow(kevin);

    const { status, json } = await wake(kevin, jar);

    expect(status).toBe(404);
    expect(json.error.code).toBe("not_found");
    expect(await fullRow(kevin)).toEqual(before);
  });

  it("refuses a request without a session as 401", async () => {
    await setBird(gerald, "status = 'busy', busy_kind = 'nap', busy_until = $2", [
      new Date(deps.clock.now() + 10 * MINUTE),
    ]);

    const { status, json } = await wake(gerald);

    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
    expect((await birdRow(gerald)).status).toBe("busy");
  });
});
