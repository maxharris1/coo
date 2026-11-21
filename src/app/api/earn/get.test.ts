import { beforeEach, describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import type { UserId } from "@/server/ports/auth";
import { onboard } from "@/server/services/onboarding";
import { tick } from "@/server/services/tick";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { insertPlannedDelivery } from "@/test/fixtures/plannedFlight";
import { geoClient } from "@/test/geoRoute";
import { seedWorld, type World } from "@/test/seedWorld";
import { earnGet } from "./get";

const HOUR = 3_600_000;
const SETUP = {
  timezone: "America/New_York",
  bird: { name: "Gerald", look: "gerald", pronoun: "he" },
};

let deps: TestDeps;
let client: ReturnType<typeof geoClient>;

beforeEach(async () => {
  deps = await makeTestDeps();
  client = geoClient(deps, earnGet, "/api/earn");
});

async function withProfile(number: string, name: string) {
  const session = await client.signIn(number);
  await onboard(deps, session.id as UserId, { ...SETUP, name });
  return session;
}

async function onboarded(number: string, name: string, timezone: string) {
  const session = await withProfile(number, name);
  await deps.db.query(
    "update profiles set onboarded_at = to_timestamp($2 / 1000.0), timezone = $3 where id = $1",
    [session.id, deps.clock.now(), timezone],
  );
  return session;
}

async function card(id: string, weekStart: string, deliveries: number) {
  await deps.db.query(
    "insert into punch_cards (user_id, week_start, deliveries, paid) values ($1, $2, $3, $4)",
    [id, weekStart, deliveries, deliveries >= config.game.seeds.punchCardSize],
  );
}

describe("GET /api/earn", () => {
  it("refuses a request without a session as 401", async () => {
    const { status, json } = await client.get({});
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
  });

  it("refuses a user who has not finished onboarding as 409 not_onboarded", async () => {
    const { jar } = await withProfile("(555) 123-4567", "Max");
    const { status, json } = await client.get({}, jar);
    expect(status).toBe(409);
    expect(json.error.code).toBe("not_onboarded");
  });

  it("punch card follows the local week across Sunday to Monday in Los Angeles", async () => {
    const { id, jar } = await onboarded(
      "(555) 123-4567",
      "Max",
      "America/Los_Angeles",
    );
    await card(id, "2026-11-16", 6);
    await card(id, "2026-11-23", 2);

    deps.clock.set(Date.UTC(2026, 10, 23, 7, 30));
    const sunday = await client.get({}, jar);
    expect(sunday.status).toBe(200);
    expect(sunday.json.punchCard).toEqual({
      weekStart: "2026-11-16",
      deliveries: 6,
      size: config.game.seeds.punchCardSize,
      pay: config.game.seeds.punchCardPay,
      paid: false,
    });

    deps.clock.advance(HOUR);
    const monday = await client.get({}, jar);
    expect(monday.json.punchCard).toMatchObject({
      weekStart: "2026-11-23",
      deliveries: 2,
    });
  });

  it("punch card follows the local week across Sunday to Monday in Tokyo", async () => {
    const { id, jar } = await onboarded("(555) 123-4567", "Max", "Asia/Tokyo");
    await card(id, "2026-11-16", 10);
    await card(id, "2026-11-23", 1);

    deps.clock.set(Date.UTC(2026, 10, 22, 14, 30));
    let { json } = await client.get({}, jar);
    expect(json.punchCard).toMatchObject({
      weekStart: "2026-11-16",
      deliveries: 10,
      paid: true,
    });

    deps.clock.advance(HOUR);
    ({ json } = await client.get({}, jar));
    expect(json.punchCard).toMatchObject({
      weekStart: "2026-11-23",
      deliveries: 1,
      paid: false,
    });
  });

  it("shows an empty card for a week with no deliveries", async () => {
    const { jar } = await onboarded(
      "(555) 123-4567",
      "Max",
      "America/Los_Angeles",
    );
    deps.clock.set(Date.UTC(2026, 10, 23, 8, 30));
    const { json } = await client.get({}, jar);
    expect(json.punchCard).toMatchObject({
      weekStart: "2026-11-23",
      deliveries: 0,
      paid: false,
    });
  });

  it("shows the pay table from config, with the party hat bonus only when owned", async () => {
    const { id, jar } = await onboarded(
      "(555) 123-4567",
      "Max",
      "America/New_York",
    );
    const { seeds } = config.game;
    let { json } = await client.get({}, jar);
    expect(json.payTable).toEqual({
      delivery: {
        base: seeds.deliveryBase,
        milesPerBonusSeed: seeds.milesPerBonusSeed,
        fullPayPerDay: seeds.fullPayDeliveriesPerDay,
        reducedPay: seeds.reducedDeliveryPay,
      },
      replyHome: seeds.replyHome,
      newCity: seeds.newCity,
      partyHatWeekend: null,
    });
    expect(json.jobs).toBeDefined();
    expect(json.found).toBeDefined();

    await deps.db.query(
      "insert into gear_owned (user_id, gear_id, acquired_at) values ($1, 'party', now())",
      [id],
    );
    ({ json } = await client.get({}, jar));
    expect(json.payTable.partyHatWeekend).toBe(seeds.partyHatWeekendBonus);
  });

  it("reflects only the caller's card and balance", async () => {
    const other = await onboarded(
      "(555) 765-4321",
      "Brenda",
      "America/New_York",
    );
    await card(other.id, "2026-11-16", 9);
    await deps.db.query("select apply_seeds($1, 900, 'test', null)", [
      other.id,
    ]);
    const { jar } = await onboarded(
      "(555) 123-4567",
      "Max",
      "America/New_York",
    );
    const { json } = await client.get({ userId: other.id }, jar);
    expect(json.seeds).toBe(config.game.start.seeds);
    expect(json.punchCard).toMatchObject({ deliveries: 0 });
  });
});

describe("GET /api/earn?flight=", () => {
  const MINUTE = 60_000;
  const PHONE = { max: "(555) 000-0001", priya: "(555) 000-0002" };
  let world: World;

  beforeEach(async () => {
    world = await seedWorld(deps.db, deps.clock.now());
  });

  async function seedsOf(id: string) {
    const [{ seeds }] = await deps.db.query<{ seeds: number }>(
      "select seeds from profiles where id = $1",
      [id],
    );
    return seeds;
  }

  async function land(flight: { arriveAtMs: number }) {
    deps.clock.set(flight.arriveAtMs + MINUTE);
    await tick(deps);
  }

  it("lists delivery, new city and punch card lines that sum to the balance change", async () => {
    const flight = await insertPlannedDelivery(
      deps.db,
      world,
      deps.clock.now(),
    );
    await card(world.max.id, "2026-11-16", 9);
    const before = await seedsOf(world.max.id);
    await land(flight);
    const after = await seedsOf(world.max.id);

    const { jar } = await client.signIn(PHONE.max);
    const { status, json } = await client.get({ flight: flight.flightId }, jar);

    expect(status).toBe(200);
    expect(json.earned.flightId).toBe(flight.flightId);
    const lines: { reason: string; seeds: number }[] = json.earned.lines;
    expect(lines.map((l) => l.reason)).toEqual([
      "delivery",
      "new_city",
      "punch_card",
    ]);
    expect(lines[1].seeds).toBe(config.game.seeds.newCity);
    expect(lines[2].seeds).toBe(config.game.seeds.punchCardPay);
    expect(lines.reduce((sum, l) => sum + l.seeds, 0)).toBe(after - before);
    expect(json.seeds).toBe(after);
    expect(json.punchCard).toMatchObject({ deliveries: 10, paid: true });
  });

  it("lists only the delivery line for a repeat city", async () => {
    const first = await insertPlannedDelivery(deps.db, world, deps.clock.now());
    await land(first);
    const second = await insertPlannedDelivery(
      deps.db,
      world,
      deps.clock.now(),
      { birdId: world.max.birds[1].id },
    );
    const before = await seedsOf(world.max.id);
    await land(second);
    const after = await seedsOf(world.max.id);

    const { jar } = await client.signIn(PHONE.max);
    const { json } = await client.get({ flight: second.flightId }, jar);

    expect(json.earned).toEqual({
      flightId: second.flightId,
      lines: [{ reason: "delivery", seeds: after - before }],
    });
  });

  it("gives no lines for the caller's flight that is still flying", async () => {
    const flight = await insertPlannedDelivery(
      deps.db,
      world,
      deps.clock.now(),
    );
    const { jar } = await client.signIn(PHONE.max);
    const { status, json } = await client.get({ flight: flight.flightId }, jar);
    expect(status).toBe(200);
    expect(json.earned).toEqual({ flightId: flight.flightId, lines: [] });
  });

  it("leaves earned null without a flight query", async () => {
    const { jar } = await client.signIn(PHONE.max);
    const { json } = await client.get({}, jar);
    expect(json.earned).toBeNull();
  });

  it("refuses someone else's flight, an incoming flight and an unknown id with the same 404", async () => {
    const priyas = await insertPlannedDelivery(
      deps.db,
      world,
      deps.clock.now(),
      { from: world.priya, to: world.rosa, birdId: world.priya.birds[0].id },
    );
    const incoming = await insertPlannedDelivery(
      deps.db,
      world,
      deps.clock.now(),
      { from: world.priya, to: world.max, birdId: world.priya.birds[1].id },
    );
    await land(incoming);
    const { jar } = await client.signIn(PHONE.max);

    const refusals = await Promise.all(
      [
        priyas.flightId,
        incoming.flightId,
        "00000000-0000-4000-a000-0000000000ff",
      ].map((flight) => client.get({ flight }, jar)),
    );
    for (const { status, json } of refusals) {
      expect(status).toBe(404);
      expect(json).toEqual(refusals[0].json);
    }
    expect(refusals[0].json.error.code).toBe("not_found");
  });

  it("refuses a malformed flight id as 400", async () => {
    const { jar } = await client.signIn(PHONE.max);
    const { status, json } = await client.get({ flight: "nope" }, jar);
    expect(status).toBe(400);
    expect(json.error.code).toBe("invalid");
  });
});
