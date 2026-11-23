import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { flightsPost } from "@/app/api/flights/post";
import { config } from "@/lib/config";
import type { UserId } from "@/server/ports/auth";
import { pair } from "@/server/rows";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { addDelivery } from "@/test/fixtures/flights";
import { addNote } from "@/test/fixtures/notes";
import { setShots, shotsOf } from "@/test/fixtures/espresso";
import { FakeClock } from "@/test/fakes/clock";
import { geoClient } from "@/test/geoRoute";
import { seedWorld, type World } from "@/test/seedWorld";
import { send } from "./send";

vi.mock("node:crypto", async (load) => {
  const actual = await load<typeof import("node:crypto")>();
  return { ...actual, randomUUID: vi.fn(actual.randomUUID) };
});

const BODY = "Bring the good bagels on Sunday";
const ZED = "00000000-0000-4000-a000-0000000000ed" as UserId;
const MABEL = "00000000-0000-4000-b000-000000000013";
const ON_TIME_FLIGHT = "00000000-0000-4000-8000-000000000001";
const OVERNIGHT_FLIGHT = "00000000-0000-4000-8000-000000000034";

let deps: TestDeps;
let world: World;
let max: UserId;
let priya: UserId;
let rosa: UserId;
let gerald: string;
let brenda: string;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
  max = world.max.id as UserId;
  priya = world.priya.id as UserId;
  rosa = world.rosa.id as UserId;
  gerald = world.max.birds[0].id;
  brenda = world.max.birds[1].id;
  await addZedAndMabel();
});

async function addZedAndMabel() {
  const now = new Date(deps.clock.now()).toISOString();
  const bird = config.game.start.birds[0];
  const { care } = config.game.start;
  await deps.db.query(
    "insert into auth.users (id, phone, created_at) values ($1, '15550000009', $2)",
    [ZED, now],
  );
  await deps.db.query(
    `insert into profiles (id, name, handle, invite_code, home_lat, home_lon, home_label,
       home_city, home_city_lat, home_city_lon, onboarded_at, created_at)
     values ($1, 'Zed', 'zed', 'seed-zed', 42.36, -71.06, 'Back Bay', 'Boston',
       42.36, -71.06, $2, $2)`,
    [ZED, now],
  );
  await deps.db.query(
    "insert into friendships (a_id, b_id, created_at) values ($1, $2, $3)",
    [...pair(max, ZED), now],
  );
  await deps.db.query(
    `insert into birds (id, owner_id, name, look, speed_mph, focus, navigation,
       belly, feathers, energy, care_at, last_fed_at, hatched_at)
     values ($1, $2, 'Mabel', $3, $4, $5, $6, $7, $8, $9, $10, $10, $10)`,
    [
      MABEL,
      max,
      config.game.start.looks[0],
      bird.speedMph,
      bird.focus,
      bird.navigation,
      care.belly,
      care.feathers,
      care.energy,
      now,
    ],
  );
}

function threeSends() {
  return [
    { friendId: priya, birdId: gerald },
    { friendId: rosa, birdId: brenda },
    { friendId: ZED, birdId: MABEL },
  ];
}

async function refusal(
  promise: Promise<unknown>,
): Promise<{ code: string; message: string }> {
  try {
    await promise;
  } catch (error) {
    const { code, message } = error as { code: string; message: string };
    return { code, message };
  }
  return { code: "resolved", message: "" };
}

async function counts() {
  const [row] = await deps.db.query<{
    away_birds: number;
    notes: number;
    flights: number;
    notifications: number;
  }>(
    `select (select count(*)::int from birds where status <> 'home') as away_birds,
       (select count(*)::int from notes) as notes,
       (select count(*)::int from flights) as flights,
       (select count(*)::int from notifications) as notifications`,
  );
  return row;
}

async function wearTube(birdId: string) {
  await deps.db.query(
    "insert into gear_owned (user_id, gear_id) values ($1, 'tube') on conflict do nothing",
    [max],
  );
  await deps.db.query("update birds set gear = '{tube}' where id = $1", [
    birdId,
  ]);
}

function between(low: number, high: number): string {
  expect(high).toBeGreaterThan(low);
  return "a".repeat(low + 1);
}

describe("sendMany through send", () => {
  it("three friends and three ready birds make three notes, three flights and three incoming notifications", async () => {
    const before = await counts();

    const { flights } = await send(deps, max, {
      body: BODY,
      sends: threeSends(),
    });

    expect(await counts()).toEqual({
      away_birds: before.away_birds + 3,
      notes: before.notes + 3,
      flights: before.flights + 3,
      notifications: before.notifications + 3,
    });
    expect(flights).toHaveLength(3);
    const rows = await deps.db.query<{
      id: string;
      bird_id: string;
      counterpart_id: string;
      status: string;
      body: string;
      recipient_id: string;
    }>(
      `select f.id, f.bird_id, f.counterpart_id, f.status, n.body, n.recipient_id
       from flights f join notes n on n.id = f.note_id
       where f.owner_id = $1 order by f.counterpart_id`,
      [max],
    );
    expect(
      rows.map((r) => [r.counterpart_id, r.bird_id, r.recipient_id, r.body]),
    ).toEqual(
      threeSends()
        .map((s) => [s.friendId, s.birdId, s.friendId, BODY])
        .sort((a, b) => a[0].localeCompare(b[0])),
    );
    expect(rows.every((r) => r.status === "flying")).toBe(true);
    expect(flights.map((f) => f.id).sort()).toEqual(
      rows.map((r) => r.id).sort(),
    );
    const incoming = await deps.db.query<{ user_id: string; ref_id: string }>(
      "select user_id, ref_id from notifications where kind = 'incoming' order by user_id",
    );
    expect(incoming.map((n) => [n.user_id, n.ref_id])).toEqual(
      rows.map((r) => [r.counterpart_id, r.id]),
    );
  });

  it.each([
    [ON_TIME_FLIGHT, "Lands this afternoon."],
    [OVERNIGHT_FLIGHT, "Lands early tomorrow morning."],
  ] as const)(
    "tells each recipient the time of day the pigeon lands, not a clock time, when Priya's flight is %s",
    async (id, lands) => {
      deps.clock.set(Date.UTC(2026, 10, 19, 17, 30));
      vi.mocked(randomUUID).mockReturnValueOnce(id);
      await send(deps, max, { body: BODY, sends: threeSends() });

      const incoming = await deps.db.query<{
        user_id: string;
        ref_id: string;
        body: string;
      }>(
        "select user_id, ref_id, body from notifications where kind = 'incoming'",
      );
      expect(incoming).toHaveLength(3);
      expect(incoming.find((n) => n.user_id === priya)).toMatchObject({
        ref_id: id,
        body: expect.stringContaining(lands),
      });
      for (const { body } of incoming) {
        expect(body).not.toMatch(/\d{1,2}:\d{2}\s?[ap]m/i);
      }
    },
  );

  describe("refuses the whole batch when one bird cannot fly, naming the bird", () => {
    it.each([
      ["flying", "status = 'flying'", "conflict", "Brenda is not home"],
      [
        "napping",
        "status = 'busy', busy_kind = 'nap', busy_until = $2",
        "conflict",
        "Brenda is not home",
      ],
      ["too tired", "energy = 5", "conflict", "Brenda is too tired to fly"],
    ])("%s", async (_, change, code, message) => {
      await deps.db.query(
        `update birds set ${change}, care_at = $2 where id = $1`,
        [brenda, new Date(deps.clock.now()).toISOString()],
      );
      const before = await counts();

      expect(
        await refusal(send(deps, max, { body: BODY, sends: threeSends() })),
      ).toEqual({ code, message });

      expect(await counts()).toEqual(before);
    });

    it("when the bird stops being ready after the first check", async () => {
      const port = deps.weather;
      deps = {
        ...deps,
        weather: Object.assign(Object.create(port), {
          samples: async (at: Parameters<typeof port.samples>[0]) => {
            await deps.db.query(
              "update birds set status = 'flying' where id = $1",
              [MABEL],
            );
            return port.samples(at);
          },
        }),
      };
      const before = await counts();

      expect(
        await refusal(send(deps, max, { body: BODY, sends: threeSends() })),
      ).toEqual({ code: "conflict", message: "Mabel is not home" });

      expect({ ...(await counts()), away_birds: before.away_birds }).toEqual(
        before,
      );
      const homes = await deps.db.query<{ id: string }>(
        "select id from birds where id = any($1::uuid[]) and status = 'home'",
        [[gerald, brenda]],
      );
      expect(homes).toHaveLength(2);
    });
  });

  it("refuses six recipients as invalid and creates nothing", async () => {
    const before = await counts();
    const sends = Array.from({ length: 6 }, (_, i) => ({
      friendId: [priya, rosa, ZED][i % 3],
      birdId: `00000000-0000-4000-b000-00000000010${i}`,
    }));

    expect((await refusal(send(deps, max, { body: BODY, sends }))).code).toBe(
      "invalid",
    );

    expect(await counts()).toEqual(before);
  });

  it("refuses the same bird twice as invalid and creates nothing", async () => {
    const before = await counts();

    expect(
      (
        await refusal(
          send(deps, max, {
            body: BODY,
            sends: [
              { friendId: priya, birdId: gerald },
              { friendId: rosa, birdId: gerald },
            ],
          }),
        )
      ).code,
    ).toBe("invalid");

    expect(await counts()).toEqual(before);
  });

  it("refuses the same friend twice as invalid and creates nothing", async () => {
    const before = await counts();

    expect(
      (
        await refusal(
          send(deps, max, {
            body: BODY,
            sends: [
              { friendId: priya, birdId: gerald },
              { friendId: priya, birdId: brenda },
            ],
          }),
        )
      ).code,
    ).toBe("invalid");

    expect(await counts()).toEqual(before);
  });

  it("refuses the same bird spelled in two cases as invalid and creates nothing", async () => {
    const before = await counts();

    expect(
      (
        await refusal(
          send(deps, max, {
            body: BODY,
            sends: [
              { friendId: priya, birdId: gerald },
              { friendId: rosa, birdId: gerald.toUpperCase() },
            ],
          }),
        )
      ).code,
    ).toBe("invalid");

    expect(await counts()).toEqual(before);
  });

  it("refuses the same friend spelled in two cases as invalid and creates nothing", async () => {
    const before = await counts();

    expect(
      await refusal(
        send(deps, max, {
          body: BODY,
          sends: [
            { friendId: ZED, birdId: gerald },
            { friendId: ZED.toUpperCase() as UserId, birdId: brenda },
          ],
        }),
      ),
    ).toEqual({ code: "invalid", message: "sends: each friend once" });

    expect(await counts()).toEqual(before);
  });

  it("refuses a note that fits one bird's tube but not another's, naming the bird", async () => {
    await wearTube(gerald);
    const { baseLimit, tubeLimit } = config.game.notes;
    const body = between(baseLimit, tubeLimit);
    const before = await counts();

    const { code, message } = await refusal(
      send(deps, max, {
        body,
        sends: [
          { friendId: priya, birdId: gerald },
          { friendId: rosa, birdId: brenda },
        ],
      }),
    );

    expect(code).toBe("invalid");
    expect(message).toBe(
      `body: Brenda can carry ${baseLimit} characters, this note has ${baseLimit + 1}`,
    );
    expect(await counts()).toEqual(before);
  });

  it("refuses someone else's bird as not_found and creates nothing", async () => {
    const before = await counts();

    expect(
      (
        await refusal(
          send(deps, max, {
            body: BODY,
            sends: [
              { friendId: priya, birdId: gerald },
              { friendId: rosa, birdId: world.priya.birds[0].id },
            ],
          }),
        )
      ).code,
    ).toBe("not_found");

    expect(await counts()).toEqual(before);
  });

  it("refuses a send to someone who is not a friend as forbidden and creates nothing", async () => {
    const before = await counts();

    expect(
      (
        await refusal(
          send(deps, priya, {
            body: BODY,
            sends: [
              { friendId: max, birdId: world.priya.birds[0].id },
              { friendId: rosa, birdId: world.priya.birds[1].id },
            ],
          }),
        )
      ).code,
    ).toBe("forbidden");

    expect(await counts()).toEqual(before);
  });

  it("refuses the same request again after it succeeds, naming the first bird", async () => {
    await send(deps, max, { body: BODY, sends: threeSends() });
    const before = await counts();

    expect(
      await refusal(send(deps, max, { body: BODY, sends: threeSends() })),
    ).toEqual({ code: "conflict", message: "Gerald is not home" });

    expect(await counts()).toEqual(before);
  });

  it("refuses a batch that would pass the daily limit as rate_limited and creates nothing", async () => {
    const { flightsPerDay } = config.game.limits;
    const now = deps.clock.now();
    for (let i = 0; i < flightsPerDay - 2; i++) {
      const note = await addNote(deps.db, world.max, world.priya, now, true);
      await addDelivery(
        deps.db,
        world.max,
        world.priya,
        gerald,
        note,
        "landed",
        now,
        now,
      );
    }
    const before = await counts();

    expect(
      (await refusal(send(deps, max, { body: BODY, sends: threeSends() })))
        .code,
    ).toBe("rate_limited");

    expect(await counts()).toEqual(before);
  });
});

describe("sendMany with espresso", () => {
  const TEN_PM = Date.UTC(2026, 10, 20, 3);

  beforeEach(async () => {
    deps = await makeTestDeps({ clock: new FakeClock(TEN_PM) });
    world = await seedWorld(deps.db, TEN_PM);
  });

  const twoFlagged = () => [
    { friendId: priya, birdId: gerald, espresso: true },
    { friendId: rosa, birdId: brenda, espresso: true },
  ];

  it("spends one shot per flagged bird", async () => {
    await setShots(deps.db, max, 2);

    const { flights } = await send(deps, max, {
      body: BODY,
      sends: twoFlagged(),
    });

    expect(flights).toHaveLength(2);
    expect(await shotsOf(deps.db, max)).toBe(0);
    const stored = await deps.db.query<{
      input: { nightFlightUntilMs?: number };
    }>("select input from flights where owner_id = $1", [max]);
    expect(stored.map((f) => typeof f.input.nightFlightUntilMs)).toEqual([
      "number",
      "number",
    ]);
  });

  it("refuses the whole batch when there are not enough shots and spends nothing", async () => {
    await setShots(deps.db, max, 1);
    const before = await counts();

    expect(
      (await refusal(send(deps, max, { body: BODY, sends: twoFlagged() })))
        .code,
    ).toBe("conflict");

    expect(await counts()).toEqual(before);
    expect(await shotsOf(deps.db, max)).toBe(1);
  });
});

describe("several sends through POST /api/flights", () => {
  async function post(body: unknown) {
    const client = geoClient(deps, flightsPost, "/api/flights");
    const { jar } = await client.signIn("+15550000001");
    return client.post(body, jar);
  }

  it("answers 200 with three flights", async () => {
    const before = await counts();

    const { status, json } = await post({ body: BODY, sends: threeSends() });

    expect(status).toBe(200);
    expect(json.flights).toHaveLength(3);
    expect(await counts()).toMatchObject({
      notes: before.notes + 3,
      flights: before.flights + 3,
    });
  });

  it("answers 200 with three flights when the ids are uppercase", async () => {
    const before = await counts();

    const { status, json } = await post({
      body: BODY,
      sends: threeSends().map((s) => ({
        friendId: s.friendId.toUpperCase(),
        birdId: s.birdId.toUpperCase(),
      })),
    });

    expect(status).toBe(200);
    expect(json.flights).toHaveLength(3);
    expect(await counts()).toMatchObject({
      notes: before.notes + 3,
      flights: before.flights + 3,
    });
  });

  it("answers 400 invalid for six recipients", async () => {
    const sends = Array.from({ length: 6 }, (_, i) => ({
      friendId: [priya, rosa, ZED][i % 3],
      birdId: `00000000-0000-4000-b000-00000000010${i}`,
    }));

    const { status, json } = await post({ body: BODY, sends });

    expect(status).toBe(400);
    expect(json.error.code).toBe("invalid");
  });

  it("answers 400 naming the bird whose tube the note overflows", async () => {
    await wearTube(gerald);
    const { baseLimit, tubeLimit } = config.game.notes;
    const before = await counts();

    const { status, json } = await post({
      body: between(baseLimit, tubeLimit),
      sends: [
        { friendId: priya, birdId: gerald },
        { friendId: rosa, birdId: brenda },
      ],
    });

    expect(status).toBe(400);
    expect(json.error).toEqual({
      code: "invalid",
      message: `body: Brenda can carry ${baseLimit} characters, this note has ${baseLimit + 1}`,
    });
    expect(await counts()).toEqual(before);
  });
});
