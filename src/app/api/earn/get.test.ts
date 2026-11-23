import { beforeEach, describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import { offersFor } from "@/lib/game/jobs";
import { jobPay } from "@/lib/game/seeds";
import type { LocalDate } from "@/lib/game/time";
import type { OnboardedCaller, Profile } from "@/server/auth";
import type { UserId } from "@/server/ports/auth";
import { startJob } from "@/server/services/jobs/start";
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

describe("GET /api/earn jobs", () => {
  const TZ = "America/New_York";
  const MINUTE = 60_000;

  async function startedJob(userId: string, startedAtMs: number) {
    const [bird] = await deps.db.query<{ id: string }>(
      "select id from birds where owner_id = $1 limit 1",
      [userId],
    );
    await deps.db.query(
      `insert into jobs (user_id, bird_id, job_id, pay, started_at, ends_at, status)
       values ($1, $2, 'x', 1, to_timestamp($3 / 1000.0), to_timestamp($3 / 1000.0), 'done')`,
      [userId, bird.id, startedAtMs],
    );
  }

  function pair(json: { jobs: { offers: { id: string }[] } }) {
    return json.jobs.offers.map((o) => o.id);
  }

  it.each([
    {
      early: Date.UTC(2026, 10, 21, 5, 5),
      late: Date.UTC(2026, 10, 22, 4, 55),
      nextDay: Date.UTC(2026, 10, 22, 5, 5),
      today: "2026-11-21",
      tomorrow: "2026-11-22",
    },
    {
      early: Date.UTC(2026, 3, 6, 4, 5),
      late: Date.UTC(2026, 3, 7, 3, 55),
      nextDay: Date.UTC(2026, 3, 7, 4, 5),
      today: "2026-04-06",
      tomorrow: "2026-04-07",
    },
  ])(
    "offers the same two jobs all local day $today and a different pair on $tomorrow",
    async ({ early, late, nextDay, today, tomorrow }) => {
      const world = await seedWorld(deps.db, deps.clock.now());
      const id = world.max.id;
      await deps.db.query("update profiles set timezone = $2 where id = $1", [
        id,
        TZ,
      ]);
      const { jar } = await client.signIn("(555) 000-0001");
      const expected = (date: string) => offersFor(id, date as LocalDate);

      deps.clock.set(early);
      const morning = await client.get({}, jar);
      expect(morning.status).toBe(200);
      expect(morning.json.jobs.offers).toHaveLength(config.game.jobs.offered);
      expect(pair(morning.json)).toEqual(expected(today).map((j) => j.id));
      expect(morning.json.jobs.offers[0]).toEqual({
        id: expected(today)[0].id,
        text: expected(today)[0].text,
        minutes: expected(today)[0].minutes,
        pay: expected(today)[0].pay,
      });

      deps.clock.set(late);
      const night = await client.get({}, jar);
      expect(pair(night.json)).toEqual(pair(morning.json));

      deps.clock.set(nextDay);
      const nextMorning = await client.get({}, jar);
      expect(pair(nextMorning.json)).toEqual(
        expected(tomorrow).map((j) => j.id),
      );
      expect(pair(nextMorning.json)).not.toEqual(pair(morning.json));
    },
  );

  it("follows the caller's own local day, not UTC", async () => {
    const { id, jar } = await onboarded("(555) 123-4567", "Max", "Asia/Tokyo");
    deps.clock.set(Date.UTC(2026, 10, 21, 16, 0));
    const { json } = await client.get({}, jar);
    expect(pair(json)).toEqual(
      offersFor(id, "2026-11-22" as LocalDate).map((j) => j.id),
    );
  });

  it("counts down jobs left today and halves pay after the full-pay jobs", async () => {
    const { id, jar } = await onboarded("(555) 123-4567", "Max", TZ);
    const now = Date.UTC(2026, 10, 21, 18, 0);
    deps.clock.set(now);
    const { fullPayPerDay, maxPerDay, reducedPayFactor } = config.game.jobs;
    const full = offersFor(id, "2026-11-21" as LocalDate);

    let { json } = await client.get({}, jar);
    expect(json.jobs.leftToday).toBe(maxPerDay);

    await startedJob(id, Date.UTC(2026, 10, 21, 4, 0));
    for (let i = 0; i < fullPayPerDay; i++) {
      await startedJob(id, now - (i + 1) * MINUTE);
    }
    ({ json } = await client.get({}, jar));
    expect(json.jobs.leftToday).toBe(maxPerDay - fullPayPerDay);
    expect(json.jobs.offers.map((o: { pay: number }) => o.pay)).toEqual(
      full.map((j) => Math.floor(j.pay * reducedPayFactor)),
    );

    for (let i = fullPayPerDay; i < maxPerDay + 1; i++) {
      await startedJob(id, now - (i + 1) * MINUTE);
    }
    ({ json } = await client.get({}, jar));
    expect(json.jobs.leftToday).toBe(0);
    expect(pair(json)).toEqual(full.map((j) => j.id));
    expect(json.jobs.offers.map((o: { pay: number }) => o.pay)).toEqual([0, 0]);
  });

  it("counts only the caller's own jobs and offers by the caller's id", async () => {
    const other = await onboarded("(555) 765-4321", "Brenda", TZ);
    const now = Date.UTC(2026, 10, 21, 18, 0);
    deps.clock.set(now);
    for (let i = 0; i < config.game.jobs.maxPerDay; i++) {
      await startedJob(other.id, now - (i + 1) * MINUTE);
    }
    const { id, jar } = await onboarded("(555) 123-4567", "Max", TZ);
    const { json } = await client.get({ userId: other.id }, jar);
    expect(json.jobs.leftToday).toBe(config.game.jobs.maxPerDay);
    expect(pair(json)).toEqual(
      offersFor(id, "2026-11-21" as LocalDate).map((j) => j.id),
    );
  });

  describe("with a running job", () => {
    const DATE = "2026-11-21" as LocalDate;
    const NOW = Date.UTC(2026, 10, 21, 15, 0);
    let world: World;
    let jar: Awaited<ReturnType<typeof client.signIn>>["jar"];

    beforeEach(async () => {
      world = await seedWorld(deps.db, deps.clock.now());
      await deps.db.query("update profiles set timezone = $2 where id = $1", [
        world.max.id,
        TZ,
      ]);
      deps.clock.set(NOW);
      ({ jar } = await client.signIn("(555) 000-0001"));
    });

    async function start(jobId: string, birdIndex: number) {
      const [profile] = await deps.db.query<Profile & { onboarded_at: Date }>(
        "select * from profiles where id = $1",
        [world.max.id],
      );
      const caller: OnboardedCaller = {
        userId: world.max.id as UserId,
        profile,
      };
      return startJob(deps, caller, {
        jobId,
        birdId: world.max.birds[birdIndex].id,
      });
    }

    it("offers only the other job of today's pair, priced after the start (ac-1)", async () => {
      const [a, b] = offersFor(world.max.id, DATE);
      const earlier = config.game.jobs.fullPayPerDay - 1;
      for (let i = 0; i < earlier; i++) {
        await startedJob(world.max.id, NOW - (i + 1) * MINUTE);
      }

      await start(a.id, 0);
      const { status, json } = await client.get({}, jar);

      expect(status).toBe(200);
      const pay = Math.floor(b.pay * config.game.jobs.reducedPayFactor);
      expect(jobPay(b, earlier + 1)).toEqual({ ok: true, seeds: pay });
      expect(json.jobs).toEqual({
        offers: [{ id: b.id, text: b.text, minutes: b.minutes, pay }],
        leftToday: config.game.jobs.maxPerDay - earlier - 1,
      });
    });

    it("offers the job again once it is done, and it starts again (ac-2)", async () => {
      const [a, b] = offersFor(world.max.id, DATE);
      const { job } = await start(a.id, 0);

      deps.clock.set(Date.parse(job.endsAt) + MINUTE);
      await tick(deps);
      const [{ status }] = await deps.db.query<{ status: string }>(
        "select status from jobs where id = $1",
        [job.id],
      );
      expect(status).toBe("done");

      const { json } = await client.get({}, jar);
      expect(pair(json)).toEqual([a.id, b.id]);
      expect(json.jobs.leftToday).toBe(config.game.jobs.maxPerDay - 1);

      const again = await start(a.id, 0);
      expect(again.job.jobId).toBe(a.id);
      expect(again.job.id).not.toBe(job.id);
    });

    it("offers nothing while both of today's jobs run, with jobs still left (ac-3)", async () => {
      const [a, b] = offersFor(world.max.id, DATE);
      await start(a.id, 0);
      await start(b.id, 1);

      const { json } = await client.get({}, jar);
      expect(json.jobs).toEqual({
        offers: [],
        leftToday: config.game.jobs.maxPerDay - 2,
      });
    });

    it("keeps an offer that only someone else has running", async () => {
      const [a, b] = offersFor(world.max.id, DATE);
      await deps.db.query(
        `insert into jobs (user_id, bird_id, job_id, pay, started_at, ends_at)
         values ($1, $2, $3, 1, to_timestamp($4 / 1000.0), to_timestamp($5 / 1000.0))`,
        [world.priya.id, world.priya.birds[0].id, a.id, NOW, NOW + HOUR],
      );

      const { json } = await client.get({ userId: world.priya.id }, jar);
      expect(pair(json)).toEqual([a.id, b.id]);
      expect(json.jobs.leftToday).toBe(config.game.jobs.maxPerDay);
    });
  });
});
