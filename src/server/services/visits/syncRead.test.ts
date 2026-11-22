import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import { toE164, type E164 } from "@/lib/phone";
import { syncGet } from "@/app/api/sync/get";
import { createJsonRoute } from "@/server/http";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { FakeJar } from "@/test/fakes/jar";
import { HOUR_MS } from "@/test/fixtures/flights";
import { insertWaitingVisit } from "@/test/fixtures/visits";
import { seedWorld, type World } from "@/test/seedWorld";
import { syncVisits } from "./syncRead";
import type { OnboardedCaller, Profile } from "@/server/auth";
import type { UserId } from "@/server/ports/auth";

const WAIT_MS = config.game.visits.waitMinutes * 60_000;

let deps: TestDeps;
let world: World;
let now: number;
let visit: Awaited<ReturnType<typeof insertWaitingVisit>>;

beforeEach(async () => {
  deps = await makeTestDeps();
  now = deps.clock.now();
  world = await seedWorld(deps.db, now);
  visit = await insertWaitingVisit(deps.db, world, now);
  await deps.db.query(
    "update flights set distance_mi = 81.37, delay_kind = 'minor' where id = $1",
    [visit.flightId],
  );
  await deps.db.query(
    "update birds set pronoun = 'she', speed_mph = 47.5 where id = $1",
    [world.max.birds[1].id],
  );
});

const brenda = () => world.max.birds[1];

describe("syncVisits", () => {
  it("gives the host the waiting visit with its note, bird, owner and trip", async () => {
    const doodle = {
      v: 1,
      w: config.game.notes.doodle.width,
      h: config.game.notes.doodle.height,
      strokes: [{ color: "ink", width: "fine", points: [[1, 2]] }],
    };
    await deps.db.query("update notes set doodle = $2::jsonb where id = $1", [
      visit.noteId,
      JSON.stringify(doodle),
    ]);
    const { visits, myVisiting } = await syncVisits(deps, world.priya.id);

    expect(myVisiting).toEqual([]);
    expect(visits).toEqual([
      {
        id: visit.visitId,
        bird: {
          id: brenda().id,
          name: brenda().name,
          breed: expect.any(String),
          look: expect.any(String),
          pronoun: "she",
          speedMph: 47.5,
          gear: expect.any(Array),
        },
        owner: {
          id: world.max.id,
          name: world.max.name,
          handle: world.max.handle,
        },
        note: {
          id: visit.noteId,
          body: "Test note from Max",
          doodle,
          createdAt: now,
        },
        arrivedAt: now,
        leavesAt: now + WAIT_MS,
        status: "waiting",
        snackGiven: false,
        returnMi: expect.closeTo(82.07, 2),
        flight: { distanceMi: 81.37, durationMs: HOUR_MS, delayKind: "minor" },
      },
    ]);
  });

  it("never lists the visit or its note for the bird's owner or a stranger", async () => {
    for (const person of [world.max, world.rosa]) {
      const { visits } = await syncVisits(deps, person.id);
      expect(visits).toEqual([]);
    }
  });

  it("tells the owner where their bird is waiting, without the note", async () => {
    const result = await syncVisits(deps, world.max.id);
    expect(result.myVisiting).toEqual([
      {
        birdId: brenda().id,
        hostName: world.priya.name,
        leavesAt: now + WAIT_MS,
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("Test note");
    expect((await syncVisits(deps, world.rosa.id)).myVisiting).toEqual([]);
  });

  it("drops the visit for both sides once leaves_at has passed", async () => {
    deps.clock.advance(WAIT_MS);
    expect(await syncVisits(deps, world.priya.id)).toEqual({
      visits: [],
      myVisiting: [],
    });
    expect(await syncVisits(deps, world.max.id)).toEqual({
      visits: [],
      myVisiting: [],
    });
  });

  it("drops a visit that is no longer waiting", async () => {
    await deps.db.query("update visits set status = 'replied' where id = $1", [
      visit.visitId,
    ]);
    expect(await syncVisits(deps, world.priya.id)).toEqual({
      visits: [],
      myVisiting: [],
    });
    expect(await syncVisits(deps, world.max.id)).toEqual({
      visits: [],
      myVisiting: [],
    });
  });
});

describe("GET /api/sync visits", () => {
  async function syncAs(phone: string) {
    const jar = new FakeJar();
    await deps.auth(jar).verifyCode(toE164(phone) as E164, "000000");
    const cookie = jar
      .getAll()
      .map(({ name, value }) => `${name}=${value}`)
      .join("; ");
    const res = await syncGet(createJsonRoute(async () => deps))(
      new NextRequest("https://coo.test/api/sync", { headers: { cookie } }),
    );
    return { status: res.status, json: await res.json() };
  }

  it("shows the note to the host and to nobody else", async () => {
    const host = await syncAs("+15550000002");
    expect(host.status).toBe(200);
    expect(host.json.visits).toHaveLength(1);
    expect(host.json.visits[0]).toMatchObject({
      id: visit.visitId,
      note: { body: "Test note from Max" },
    });
    expect(Object.keys(host.json.visits[0].bird).sort()).toEqual([
      "breed",
      "gear",
      "id",
      "look",
      "name",
      "pronoun",
      "speedMph",
    ]);
    expect(host.json.visits[0].bird).toMatchObject({
      pronoun: "she",
      speedMph: 47.5,
    });

    for (const phone of ["+15550000001", "+15550000003"]) {
      const other = await syncAs(phone);
      expect(other.status).toBe(200);
      expect(other.json.visits).toEqual([]);
      expect(JSON.stringify(other.json)).not.toContain("Test note");
    }
  });
});

describe("syncVisits return leg (ac-1)", () => {
  it("measures the return from where the bird waits after the host travels", async () => {
    const { setTravel } = await import("../loft");
    const { listFriends } = await import("../friends");
    const { replyModel } =
      await import("@/app/(app)/sill/[visitId]/reply/replyModel");
    await deps.db.query(
      "update birds set pronoun = 'they', speed_mph = 53.7 where id = $1",
      [brenda().id],
    );
    await deps.db.query(
      `update friendships
          set a_shows = case when a_id = $1 then 'city' else a_shows end,
              b_shows = case when b_id = $1 then 'city' else b_shows end`,
      [world.max.id],
    );
    await setTravel(deps, world.priya.id as UserId, {
      on: true,
      roost: { lat: 34.05, lon: -118.25 },
    });

    const [waiting] = (await syncVisits(deps, world.priya.id)).visits;
    const { friends } = await listFriends(deps, world.priya.id as UserId);
    const max = friends.find((f) => f.id === world.max.id);

    expect(max?.distanceMi).toBeGreaterThan(2000);
    expect(waiting.returnMi).toBeCloseTo(80.56, 1);
    expect(replyModel(waiting, max, now, "mi").route).toBe(
      "New York, 81 miles. About 1h 30m at their pace.",
    );

    const { replyToVisit } = await import("./reply");
    const [profile] = await deps.db.query<Profile>(
      "select * from profiles where id = $1",
      [world.priya.id],
    );
    const { flight } = await replyToVisit(
      deps,
      { userId: world.priya.id as UserId, profile } as OnboardedCaller,
      visit.visitId,
      "On my way back to New York.",
    );
    expect(flight.distanceMi).toBeCloseTo(waiting.returnMi!, 2);
  });
});
