import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import vectors from "../../../../../../reference/flight-engine/vectors.json";
import {
  computeFlightPlan,
  type FlightInput,
  type FlightPlan,
} from "@/lib/flight/engine";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { FakeClock } from "@/test/fakes/clock";
import { insertPlannedDelivery } from "@/test/fixtures/plannedFlight";
import { geoClient } from "@/test/geoRoute";
import { seedWorld, type World } from "@/test/seedWorld";
import { flightSearchPartyPost } from "./post";

const ROUTE = readFileSync(join(__dirname, "route.ts"), "utf8");
const PHONE = {
  max: "+15550000001",
  priya: "+15550000002",
  rosa: "+15550000003",
};
const MAJOR = vectors.vectors.find((v) => v.name === "delay-major")!
  .input as FlightInput;

let deps: TestDeps;
let world: World;

async function majorDelayFlight(
  from: World[keyof World],
  to: World[keyof World],
) {
  const { flightId } = await insertPlannedDelivery(
    deps.db,
    world,
    MAJOR.departAtMs,
    {
      from,
      to,
    },
  );
  const plan = computeFlightPlan(MAJOR);
  await deps.db.query(
    `update flights set input = $2, plan = $3, arrive_at = $4, delay_kind = $5
     where id = $1`,
    [
      flightId,
      JSON.stringify(MAJOR),
      JSON.stringify(plan),
      new Date(plan.arriveAtMs).toISOString(),
      plan.delayKind,
    ],
  );
  return { flightId, plan };
}

function delayStart(plan: FlightPlan): number {
  const delay = plan.segments.find((s) => s.kind === "delay");
  if (!delay) throw new Error("plan has no delay segment");
  return delay.startMs;
}

async function snapshot() {
  return {
    seeds: await deps.db.query("select id, seeds from profiles order by id"),
    flights: await deps.db.query(
      "select id, plan, arrive_at, search_party from flights order by id",
    ),
  };
}

beforeEach(async () => {
  deps = await makeTestDeps({ clock: new FakeClock(MAJOR.departAtMs) });
  world = await seedWorld(deps.db, MAJOR.departAtMs);
});

const clientFor = (id: string) =>
  geoClient(deps, flightSearchPartyPost, `/api/flights/${id}/search-party`);

async function post(who: keyof typeof PHONE, id: string) {
  const client = clientFor(id);
  const { jar } = await client.signIn(PHONE[who]);
  return client.post({}, jar);
}

describe("src/app/api/flights/[id]/search-party/route.ts", () => {
  it("holds only imports and the POST export", () => {
    const lines = ROUTE.split("\n").filter((line) => line.trim() !== "");
    const exports = lines.filter((line) => !line.startsWith("import "));
    expect(exports).toEqual([
      "export const POST = flightSearchPartyPost(jsonRoute);",
    ]);
  });
});

describe("POST /api/flights/[id]/search-party", () => {
  it("returns the flight to the owner with the search party found (ac-2)", async () => {
    const { flightId, plan } = await majorDelayFlight(world.max, world.priya);
    deps.clock.set(delayStart(plan));

    const { status, json } = await post("max", flightId);

    expect(status).toBe(200);
    expect(json.flight).toMatchObject({
      id: flightId,
      role: "mine",
      searchParty: "found",
    });
    expect(json.flight.arriveAt).toBeLessThan(plan.arriveAtMs);
  });

  it("answers the counterpart with 404 not_found and changes nothing (ac-2)", async () => {
    const { flightId, plan } = await majorDelayFlight(world.max, world.priya);
    deps.clock.set(delayStart(plan));
    const before = await snapshot();

    const { status, json } = await post("priya", flightId);

    expect(status).toBe(404);
    expect(json.error.code).toBe("not_found");
    expect(await snapshot()).toEqual(before);
  });

  it("answers a search on another user's flight with 404 not_found and changes nothing (ac-2)", async () => {
    const { flightId, plan } = await majorDelayFlight(world.rosa, world.max);
    deps.clock.set(delayStart(plan));
    const before = await snapshot();

    const { status, json } = await post("max", flightId);

    expect(status).toBe(404);
    expect(json.error.code).toBe("not_found");
    expect(JSON.stringify(json)).not.toContain(flightId);
    expect(await snapshot()).toEqual(before);
  });

  it("answers a malformed id with 404 not_found", async () => {
    const { status, json } = await post("max", "not-a-uuid");
    expect(status).toBe(404);
    expect(json.error.code).toBe("not_found");
  });

  it("refuses a request without a session as 401", async () => {
    const { flightId } = await majorDelayFlight(world.max, world.priya);
    const { status, json } = await clientFor(flightId).post({});
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
  });
});
