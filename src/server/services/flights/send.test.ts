import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeFlightPlan,
  type FlightInput,
  type FlightPlan,
} from "@/lib/flight/engine";
import { flightsPost } from "@/app/api/flights/post";
import type { Db } from "@/server/db";
import type { UserId } from "@/server/ports/auth";
import { tick } from "@/server/services/tick";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { geoClient } from "@/test/geoRoute";
import { addDelivery, HOUR_MS } from "@/test/fixtures/flights";
import { addNote } from "@/test/fixtures/notes";
import { setShots, shotsOf } from "@/test/fixtures/espresso";
import { FakeClock } from "@/test/fakes/clock";
import { seedWorld, type World } from "@/test/seedWorld";
import { block, setShows, unfriend } from "@/server/services/friends";
import { espressoUntil } from "./espresso";
import { send } from "./send";

const BODY = "Bring the good bagels on Sunday";

let deps: TestDeps;
let world: World;
let max: UserId;
let priya: UserId;
let gerald: string;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
  max = world.max.id as UserId;
  priya = world.priya.id as UserId;
  gerald = world.max.birds[0].id;
});

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as { code: string }).code;
  }
  return "resolved";
}

async function counts() {
  const [row] = await deps.db.query<{
    away_birds: number;
    notes: number;
    flights: number;
    notifications: number;
    send_events: number;
    rate_limits: number;
  }>(
    `select (select count(*)::int from birds where status <> 'home') as away_birds,
       (select count(*)::int from notes) as notes,
       (select count(*)::int from flights) as flights,
       (select count(*)::int from notifications) as notifications,
       (select count(*)::int from events where kind in ('flight', 'notification')) as send_events,
       (select count(*)::int from rate_limits) as rate_limits`,
  );
  return row;
}

async function deliveriesBy(owner: UserId): Promise<number> {
  const [{ count }] = await deps.db.query<{ count: number }>(
    "select count(*)::int from flights where owner_id = $1 and kind = 'delivery'",
    [owner],
  );
  return count;
}

async function setTimezone(user: UserId, timezone: string) {
  await deps.db.query("update profiles set timezone = $2 where id = $1", [
    user,
    timezone,
  ]);
}

function duringWeather(change: () => Promise<unknown>) {
  const port = deps.weather;
  deps = {
    ...deps,
    weather: Object.assign(Object.create(port), {
      samples: async (at: Parameters<typeof port.samples>[0]) => {
        await change();
        return port.samples(at);
      },
    }),
  };
}

type StoredFlight = {
  id: string;
  kind: string;
  status: string;
  note_id: string | null;
  arrive_at: Date;
  input: FlightInput;
  plan: FlightPlan;
};

async function storedFlight(id: string): Promise<StoredFlight> {
  const [row] = await deps.db.query<StoredFlight>(
    "select id, kind, status, note_id, arrive_at, input, plan from flights where id = $1",
    [id],
  );
  return row;
}

function sendGerald(body = BODY) {
  return send(deps, max, {
    body,
    sends: [{ friendId: priya, birdId: gerald }],
  });
}

async function sendAndLand() {
  await sendGerald();
  await deps.db.query(
    "update flights set status = 'landed' where bird_id = $1 and status = 'flying'",
    [gerald],
  );
  await deps.db.query("update birds set status = 'home' where id = $1", [
    gerald,
  ]);
}

describe("send", () => {
  it("sends one note on one flying flight", async () => {
    const before = await counts();
    const now = deps.clock.now();

    const { flights } = await sendGerald();

    expect(await counts()).toEqual({
      ...before,
      away_birds: before.away_birds + 1,
      notes: before.notes + 1,
      flights: before.flights + 1,
      notifications: before.notifications + 1,
      send_events: before.send_events + 3,
    });
    expect(flights).toHaveLength(1);
    const [flight] = flights;
    const row = await storedFlight(flight.id);
    expect(row.status).toBe("flying");
    expect(row.kind).toBe("delivery");
    expect(row.note_id).not.toBeNull();
    expect(row.plan).toEqual(computeFlightPlan(row.input));
    expect(row.arrive_at.getTime()).toBe(row.plan.arriveAtMs);
    expect(row.input.flightId).toBe(row.id);
    expect(row.input.departAtMs).toBe(now);
    expect(row.input).not.toHaveProperty("delayEndOverrideMs");

    const [bird] = await deps.db.query<{ status: string; care_at: Date }>(
      "select status, care_at from birds where id = $1",
      [gerald],
    );
    expect(bird.status).toBe("flying");
    expect(bird.care_at.getTime()).toBe(now);

    const [note] = await deps.db.query<{
      body: string;
      sender_id: string;
      recipient_id: string;
    }>("select body, sender_id, recipient_id from notes where id = $1", [
      row.note_id,
    ]);
    expect(note).toEqual({ body: BODY, sender_id: max, recipient_id: priya });

    expect(flight.id).toBe(row.id);
    expect(flight.role).toBe("mine");
    expect(flight.status).toBe("flying");
    expect(flight.hasNote).toBe(true);
  });

  it("reads the bird's gear into the stored input", async () => {
    await deps.db.query(
      "insert into gear_owned (user_id, gear_id) values ($1, 'tube') on conflict do nothing",
      [max],
    );
    await deps.db.query("update birds set gear = '{tube}' where id = $1", [
      gerald,
    ]);

    const { flights } = await sendGerald();

    expect((await storedFlight(flights[0].id)).input.gear).toEqual(["tube"]);
  });

  it("tells the recipient a pigeon is headed their way", async () => {
    const { flights } = await sendGerald();

    const rows = await deps.db.query<{
      kind: string;
      ref_id: string;
      title: string;
      body: string;
    }>(
      "select kind, ref_id, title, body from notifications where user_id = $1",
      [priya],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("incoming");
    expect(rows[0].ref_id).toBe(flights[0].id);
    expect(rows[0].title + rows[0].body).not.toContain(BODY);
  });

  it("tells the recipient the time of day the pigeon lands, not a clock time", async () => {
    deps.clock.set(Date.UTC(2026, 10, 19, 17, 30));
    await sendGerald();

    const [incoming] = await deps.db.query<{ body: string }>(
      "select body from notifications where user_id = $1 and kind = 'incoming'",
      [priya],
    );
    expect(incoming.body).toContain("Lands this afternoon.");
    expect(incoming.body).not.toMatch(/\d{1,2}:\d{2}\s?[ap]m/i);
  });

  it("refuses a send to someone who is not a friend as forbidden and creates nothing", async () => {
    const before = await counts();
    const kevin = world.priya.birds[0].id;

    expect(
      await refusal(
        send(deps, priya, {
          body: BODY,
          sends: [{ friendId: world.rosa.id as UserId, birdId: kevin }],
        }),
      ),
    ).toBe("forbidden");

    expect(await counts()).toEqual(before);
    const [bird] = await deps.db.query<{ status: string }>(
      "select status from birds where id = $1",
      [kevin],
    );
    expect(bird.status).toBe("home");
  });

  it("refuses someone else's bird as not_found", async () => {
    const before = await counts();

    expect(
      await refusal(
        send(deps, max, {
          body: BODY,
          sends: [{ friendId: priya, birdId: world.priya.birds[0].id }],
        }),
      ),
    ).toBe("not_found");

    expect(await counts()).toEqual(before);
  });

  describe("refuses a bird that cannot fly and creates nothing", () => {
    it.each([
      ["flying", "status = 'flying'"],
      ["busy", "status = 'busy', busy_kind = 'nap', busy_until = $2"],
      ["visiting", "status = 'visiting'"],
      ["scheduled", "status = 'scheduled'"],
      ["too tired", "energy = 5"],
    ])("%s", async (_, change) => {
      await deps.db.query(
        `update birds set ${change}, care_at = $2 where id = $1`,
        [gerald, new Date(deps.clock.now()).toISOString()],
      );
      const before = await counts();

      expect(await refusal(sendGerald())).toBe("conflict");

      expect(await counts()).toEqual(before);
    });
  });

  it("refuses the 41st flight of the day as rate_limited and creates nothing", async () => {
    for (let i = 0; i < 40; i++) await sendAndLand();
    const before = await counts();

    expect(await refusal(sendGerald())).toBe("rate_limited");

    expect(await counts()).toEqual(before);
    const [bird] = await deps.db.query<{ status: string }>(
      "select status from birds where id = $1",
      [gerald],
    );
    expect(bird.status).toBe("home");
  });

  it("does not count a refused send toward the daily limit", async () => {
    await deps.db.query(
      "update birds set energy = 5, care_at = $2 where id = $1",
      [gerald, new Date(deps.clock.now()).toISOString()],
    );
    for (let i = 0; i < 5; i++)
      expect(await refusal(sendGerald())).toBe("conflict");
    await deps.db.query("update birds set energy = 100 where id = $1", [
      gerald,
    ]);
    for (let i = 0; i < 40; i++) await sendAndLand();

    expect(await refusal(sendGerald())).toBe("rate_limited");
  });

  describe("counts the daily limit in the sender's local day", () => {
    it("refuses the 41st flight after UTC midnight when it is still the same evening in New York", async () => {
      await setTimezone(max, "America/New_York");
      deps.clock.set(Date.parse("2026-11-20T23:59:00Z"));
      for (let i = 0; i < 40; i++) await sendAndLand();
      deps.clock.advance(2 * 60_000);
      const before = await counts();

      expect(await refusal(sendGerald())).toBe("rate_limited");

      expect(await deliveriesBy(max)).toBe(40);
      expect(await counts()).toEqual(before);
    });

    it("allows the 41st flight once local midnight in New York has passed", async () => {
      await setTimezone(max, "America/New_York");
      deps.clock.set(Date.parse("2026-11-21T04:59:00Z"));
      for (let i = 0; i < 40; i++) await sendAndLand();
      deps.clock.advance(2 * 60_000);

      await sendGerald();

      expect(await deliveriesBy(max)).toBe(41);
    });

    it("judges the day by the moment the send started, not after the weather lookup", async () => {
      await setTimezone(max, "UTC");
      deps.clock.set(Date.parse("2026-11-20T23:59:59.500Z"));
      for (let i = 0; i < 40; i++) await sendAndLand();
      const before = await counts();
      duringWeather(async () => deps.clock.advance(1000));

      expect(await refusal(sendGerald())).toBe("rate_limited");

      expect(await deliveriesBy(max)).toBe(40);
      expect(await counts()).toEqual(before);
    });

    it("counts deliveries already in history, not only sends seen by a rate counter", async () => {
      const now = deps.clock.now();
      await deps.db.tx(async (t) => {
        for (let i = 0; i < 40; i++) {
          const noteId = await addNote(t, world.max, world.priya, now, true);
          await addDelivery(
            t,
            world.max,
            world.priya,
            gerald,
            noteId,
            "landed",
            now - HOUR_MS,
            now - HOUR_MS / 2,
          );
        }
      });
      const before = await counts();

      expect(await refusal(sendGerald())).toBe("rate_limited");

      expect(await deliveriesBy(max)).toBe(40);
      expect(await counts()).toEqual(before);
    });

    it("does not count a next-day send that commits during the weather lookup against the captured day", async () => {
      await setTimezone(max, "America/New_York");
      const brenda = world.max.birds[1].id;
      const afternoon = Date.parse("2026-11-20T20:00:00Z");
      await deps.db.tx(async (t) => {
        for (let i = 0; i < 39; i++) {
          const noteId = await addNote(
            t,
            world.max,
            world.priya,
            afternoon,
            true,
          );
          await addDelivery(
            t,
            world.max,
            world.priya,
            brenda,
            noteId,
            "landed",
            afternoon,
            afternoon + HOUR_MS,
          );
        }
      });
      deps.clock.set(Date.parse("2026-11-21T04:59:59.500Z"));
      const base = deps;
      duringWeather(async () => {
        base.clock.advance(1000);
        await send(base, max, {
          body: BODY,
          sends: [{ friendId: priya, birdId: brenda }],
        });
      });

      expect(await refusal(sendGerald())).toBe("resolved");

      const days = await deps.db.query<{ day: string; count: number }>(
        `select to_char(created_at at time zone 'America/New_York', 'YYYY-MM-DD') as day,
           count(*)::int
         from flights where owner_id = $1 and kind = 'delivery'
         group by 1 order by 1`,
        [max],
      );
      expect(days).toEqual([
        { day: "2026-11-20", count: 40 },
        { day: "2026-11-21", count: 1 },
      ]);
    });
  });

  it("sends with the fallback weather when the weather service is down", async () => {
    deps.weather.failNext();

    const { flights } = await sendGerald();

    const row = await storedFlight(flights[0].id);
    const fallback = deps.config.game.weather.fallback;
    expect(row.input.weather).toEqual([fallback, fallback, fallback]);
    expect(row.status).toBe("flying");
    expect(row.plan).toEqual(computeFlightPlan(row.input));
  });

  describe("when the friendship changes while weather is fetched", () => {
    it.each([
      ["the recipient blocks the sender", () => block(deps, priya, max)],
      ["the recipient unfriends the sender", () => unfriend(deps, priya, max)],
      [
        "the recipient switches to city sharing",
        () => setShows(deps, priya, max, "city"),
      ],
    ])(
      "refuses as forbidden when %s and creates nothing",
      async (_, change) => {
        const before = await counts();
        duringWeather(change);

        expect(await refusal(sendGerald())).toBe("forbidden");

        expect(await counts()).toEqual(before);
        const [bird] = await deps.db.query<{ status: string }>(
          "select status from birds where id = $1",
          [gerald],
        );
        expect(bird.status).toBe("home");
      },
    );
  });
});

describe("send with espresso", () => {
  const TEN_PM = Date.UTC(2026, 10, 20, 3);

  beforeEach(async () => {
    deps = await makeTestDeps({ clock: new FakeClock(TEN_PM) });
    world = await seedWorld(deps.db, TEN_PM);
  });

  function sendWithEspresso(espresso?: boolean, birdId = gerald) {
    return send(deps, max, {
      body: BODY,
      sends: [{ friendId: priya, birdId, espresso }],
    });
  }

  async function wear(gear: string[]) {
    await deps.db.query("update birds set gear = $2 where id = $1", [
      gerald,
      gear,
    ]);
  }

  const roosts = (plan: FlightPlan) =>
    plan.segments.filter((s) => s.kind === "roost");

  it("spends one shot and flies through the first night", async () => {
    await setShots(deps.db, max, 1);

    const { flights } = await sendWithEspresso(true);

    expect(await shotsOf(deps.db, max)).toBe(0);
    const row = await storedFlight(flights[0].id);
    const until = espressoUntil(row.input);
    expect(until).not.toBeNull();
    expect(row.input.nightFlightUntilMs).toBe(until);
    expect(roosts(row.plan).filter((s) => s.startMs < until!)).toEqual([]);
    expect(row.plan.segments[0]).toMatchObject({
      kind: "fly",
      startMs: TEN_PM,
    });
    expect(row.plan).toEqual(computeFlightPlan(row.input));
  });

  it("refuses a send that needs a shot when none are left and consumes nothing", async () => {
    const before = await counts();

    expect(await refusal(sendWithEspresso(true))).toBe("conflict");

    expect(await counts()).toEqual(before);
    expect(await shotsOf(deps.db, max)).toBe(0);
    const [bird] = await deps.db.query<{ status: string }>(
      "select status from birds where id = $1",
      [gerald],
    );
    expect(bird.status).toBe("home");
  });

  it("never spends a shot on a bird in night-vision goggles", async () => {
    await setShots(deps.db, max, 1);
    await wear(["nightgoggles"]);

    const { flights } = await sendWithEspresso(true);

    expect(await shotsOf(deps.db, max)).toBe(1);
    const row = await storedFlight(flights[0].id);
    expect(row.input).not.toHaveProperty("nightFlightUntilMs");
    expect(roosts(row.plan)).toEqual([]);
  });

  it("leaves the shots alone and roosts without the flag", async () => {
    await setShots(deps.db, max, 1);

    const { flights } = await sendWithEspresso();

    expect(await shotsOf(deps.db, max)).toBe(1);
    const row = await storedFlight(flights[0].id);
    expect(row.input).not.toHaveProperty("nightFlightUntilMs");
    expect(roosts(row.plan)).not.toEqual([]);
  });

  it("refuses someone else's bird and spends nothing", async () => {
    await setShots(deps.db, max, 1);

    expect(await refusal(sendWithEspresso(true, world.priya.birds[0].id))).toBe(
      "not_found",
    );

    expect(await shotsOf(deps.db, max)).toBe(1);
  });
});

describe("same-city send through POST /api/flights", () => {
  let rosa: UserId;

  beforeEach(async () => {
    rosa = world.rosa.id as UserId;
    await setShows(deps, max, rosa, "city");
    await setShows(deps, rosa, max, "city");
  });

  type Fault = (sql: string) => Promise<void> | void;

  function watchSend({
    inside,
    afterCommit,
  }: {
    inside?: Fault;
    afterCommit?: Fault;
  }) {
    const db = deps.db;
    let committed = false;
    const watched: Db = {
      async query<T>(sql: string, params?: unknown[]) {
        if (committed) await afterCommit?.(sql);
        return db.query<T>(sql, params);
      },
      async tx(fn) {
        let sending = false;
        const out = await db.tx((t) => {
          const inner: Db = {
            async query<T>(sql: string, params?: unknown[]) {
              if (sql.includes("insert into flights")) sending = true;
              if (sending) await inside?.(sql);
              return t.query<T>(sql, params);
            },
            tx: (nested) => nested(inner),
          };
          return fn(inner);
        });
        committed ||= sending;
        return out;
      },
    };
    deps = { ...deps, db: watched };
  }

  async function postToRosa() {
    const client = geoClient(deps, flightsPost, "/api/flights");
    const { jar } = await client.signIn("+15550000001");
    const res = await client.post(
      { body: BODY, sends: [{ friendId: rosa, birdId: gerald }] },
      jar,
    );
    return { ...res, cookies: jar.getAll().map(({ value }) => value) };
  }

  async function onlyFlight() {
    const rows = await deps.db.query<{
      id: string;
      status: string;
      distance_mi: number;
      release_at: Date;
      arrive_at: Date;
    }>(
      "select id, status, distance_mi, release_at, arrive_at from flights where owner_id = $1 and counterpart_id = $2",
      [max, rosa],
    );
    expect(rows).toHaveLength(1);
    return rows[0];
  }

  it("answers 200 with the zero-distance flight", async () => {
    const { status, json } = await postToRosa();

    expect(status).toBe(200);
    const row = await onlyFlight();
    expect(row.distance_mi).toBe(0);
    expect(row.arrive_at.getTime()).toBe(row.release_at.getTime());
    expect(json.flights).toHaveLength(1);
    expect(json.flights[0]).toMatchObject({
      id: row.id,
      role: "mine",
      distanceMi: 0,
    });
    expect(["flying", "landed"]).toContain(json.flights[0].status);
  });

  it("answers 200 when the tick lands the flight right after the commit", async () => {
    const base = deps;
    let landed = false;
    watchSend({
      afterCommit: async () => {
        if (landed) return;
        landed = true;
        await tick(base);
      },
    });

    const { status, json } = await postToRosa();

    expect(status).toBe(200);
    const row = await onlyFlight();
    expect(row.status).toBe("landed");
    expect(json.flights[0]).toMatchObject({ id: row.id, distanceMi: 0 });
    expect(["flying", "landed"]).toContain(json.flights[0].status);
  });

  it("answers 200 with the flight and logs only ids when deliver fails after the commit", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    watchSend({
      afterCommit: (sql) => {
        if (sql.includes("from notifications n"))
          throw new Error(`deliver broke on ${BODY} for +15550000003`);
      },
    });

    const { status, json, cookies } = await postToRosa();

    expect(status).toBe(200);
    const row = await onlyFlight();
    expect(json.flights.map((f: { id: string }) => f.id)).toEqual([row.id]);
    const [{ notes, notifications }] = await deps.db.query<{
      notes: number;
      notifications: number;
    }>(
      `select (select count(*)::int from notes where recipient_id = $1) as notes,
         (select count(*)::int from notifications where user_id = $1 and kind = 'incoming' and ref_id = $2) as notifications`,
      [rosa, row.id],
    );
    expect({ notes, notifications }).toEqual({ notes: 1, notifications: 1 });

    const lines = errors.mock.calls.map(([line]) => String(line));
    const failed = lines.filter((line) => line.includes("send.notify_failed"));
    expect(failed).toHaveLength(1);
    const [notification] = await deps.db.query<{ id: string }>(
      "select id from notifications where ref_id = $1",
      [row.id],
    );
    expect(JSON.parse(failed[0])).toMatchObject({
      level: "error",
      event: "send.notify_failed",
      notificationId: notification.id,
      flightId: row.id,
    });
    for (const secret of [BODY, "5550000001", "5550000003", ...cookies])
      expect(failed[0]).not.toContain(secret);
    errors.mockRestore();
  });

  it("answers 200 with the flight when every query after the commit fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let poolDown = true;
    watchSend({
      afterCommit: () => {
        if (poolDown) throw new Error("pool is gone");
      },
    });

    const { status, json } = await postToRosa();
    poolDown = false;

    expect(status).toBe(200);
    expect(json.flights[0]).toMatchObject({
      id: (await onlyFlight()).id,
      status: "flying",
    });
    vi.restoreAllMocks();
  });

  it("commits nothing when reading the new flight fails inside the transaction", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const before = await counts();
    watchSend({
      inside: (sql) => {
        if (sql.includes("f.note_id is not null as has_note"))
          throw new Error("read failed");
      },
    });

    const { status } = await postToRosa();

    expect(status).toBe(500);
    expect(await counts()).toEqual(before);
    vi.restoreAllMocks();
  });
});
