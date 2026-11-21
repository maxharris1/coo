import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import {
  computeFlightPlan,
  groundSpeedMph,
  type FlightInput,
  type FlightPlan,
  type WeatherSample,
} from "@/lib/flight/engine";
import { toE164, type E164 } from "@/lib/phone";
import { birdGearPut } from "@/app/api/birds/[id]/gear/put";
import { createJsonRoute } from "@/server/http";
import type { UserId } from "@/server/ports/auth";
import { send } from "@/server/services/flights/send";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { FakeJar } from "@/test/fakes/jar";
import { seedWorld, type World } from "@/test/seedWorld";

const MAX_PHONE = "+15550000001";
const BODY = "Bring an umbrella";
const RAIN: WeatherSample = {
  windMph: 0,
  windFromDeg: 0,
  tempF: 60,
  precipMmH: 2,
  snow: false,
};

let deps: TestDeps;
let world: World;
let max: UserId;
let priya: UserId;
let gerald: string;
let kevin: string;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
  max = world.max.id as UserId;
  priya = world.priya.id as UserId;
  gerald = world.max.birds[0].id;
  kevin = world.priya.birds[0].id;
  await deps.db.query(
    "insert into gear_owned (user_id, gear_id) values ($1, 'goggles')",
    [max],
  );
  deps.weather.set(RAIN);
});

async function dress(birdId: string, items: string[]) {
  const jar = new FakeJar();
  if (!(await deps.auth(jar).verifyCode(toE164(MAX_PHONE) as E164, "000000")))
    throw new Error("test sign-in failed");
  const cookie = jar
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");
  const res = await birdGearPut(createJsonRoute(async () => deps))(
    new NextRequest(`https://coo.test/api/birds/${birdId}/gear`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ items }),
    }),
    { params: Promise.resolve({ id: birdId }) },
  );
  return { status: res.status, json: await res.json() };
}

function fly(birdId: string) {
  return send(deps, max, {
    body: BODY,
    sends: [{ friendId: priya, birdId }],
  });
}

async function stored(id: string) {
  const [row] = await deps.db.query<{ input: FlightInput; plan: FlightPlan }>(
    "select input, plan from flights where id = $1",
    [id],
  );
  return row;
}

function speeds(input: FlightInput, bearing: number) {
  return [0, 1, 2].map((i) => groundSpeedMph(input, i, bearing));
}

async function flightCount(): Promise<number> {
  const [{ count }] = await deps.db.query<{ count: number }>(
    "select count(*)::int from flights",
  );
  return count;
}

describe("dress then fly", () => {
  it("stores the gear in the flight input and keeps full speed in rain with goggles (ac-1)", async () => {
    const dressed = await dress(gerald, ["goggles"]);
    expect(dressed.status).toBe(200);
    expect(dressed.json.bird.gear).toEqual(["goggles"]);

    const { flights } = await fly(gerald);

    const { input, plan } = await stored(flights[0].id);
    expect(input.gear).toEqual(["goggles"]);
    expect(input.weather).toEqual([RAIN, RAIN, RAIN]);
    expect(plan).toEqual(computeFlightPlan(input));

    const dry = {
      ...input,
      weather: input.weather.map((w) => ({ ...w, precipMmH: 0 })),
    } as FlightInput;
    const bare = { ...input, gear: [] };
    expect(speeds(input, plan.bearingDeg)).toEqual(
      speeds(dry, plan.bearingDeg),
    );
    for (const [i, mph] of speeds(bare, plan.bearingDeg).entries())
      expect(mph).toBeLessThan(speeds(input, plan.bearingDeg)[i]);
  });

  it("refuses to dress or fly another user's bird and stores no flight", async () => {
    const dressed = await dress(kevin, ["goggles"]);
    expect(dressed.status).toBe(404);
    expect(dressed.json.error.code).toBe("not_found");

    await expect(fly(kevin)).rejects.toMatchObject({ code: "not_found" });
    expect(await flightCount()).toBe(0);
  });
});
