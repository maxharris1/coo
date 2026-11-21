import { beforeEach, describe, expect, it } from "vitest";
import {
  computeFlightPlan,
  type FlightInput,
  type FlightPlan,
} from "@/lib/flight/engine";
import type { UserId } from "@/server/ports/auth";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { addDelivery, HOUR_MS } from "@/test/fixtures/flights";
import { addNote } from "@/test/fixtures/notes";
import { seedWorld, type World } from "@/test/seedWorld";
import { block, setShows, unfriend } from "@/server/services/friends";
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
