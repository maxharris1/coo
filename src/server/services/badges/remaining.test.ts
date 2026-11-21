import { beforeEach, describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import { sunTimes } from "@/lib/flight/engine";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { addNote } from "@/test/fixtures/notes";
import {
  insertPlannedDelivery,
  type PlannedDelivery,
} from "@/test/fixtures/plannedFlight";
import { seedWorld, type Person, type World } from "@/test/seedWorld";
import { tick } from "../tick";
import { rfc1149 } from "./rfc1149";

const MINUTE_MS = 60_000;
const goalOf = (id: string) =>
  config.badges.badges.find((b) => b.id === id)!.goal;

let deps: TestDeps;
let world: World;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
});

type Badge = { progress: number; earned_at: Date | null };

async function badge(userId: string, badgeId: string) {
  const [row] = await deps.db.query<Badge>(
    "select progress, earned_at from badges where user_id = $1 and badge_id = $2",
    [userId, badgeId],
  );
  return row ?? null;
}

async function land(flight: PlannedDelivery) {
  deps.clock.set(Math.max(deps.clock.now(), flight.arriveAtMs) + MINUTE_MS);
  const result = await tick(deps);
  expect(result.counts.landDeliveries).toBe(1);
}

async function landDelivery(
  opts: Parameters<typeof insertPlannedDelivery>[3] & {
    releaseMs?: number;
  } = {},
) {
  const flight = await insertPlannedDelivery(
    deps.db,
    world,
    opts.releaseMs ?? deps.clock.now(),
    opts,
  );
  await land(flight);
  return flight;
}

async function addReturn(
  owner: Person,
  host: Person,
  {
    reply = true,
    status = "landed",
    birdId = owner.birds[1].id,
  }: { reply?: boolean; status?: "flying" | "landed"; birdId?: string } = {},
) {
  const nowMs = deps.clock.now();
  deps.clock.set(nowMs + MINUTE_MS);
  const now = new Date(nowMs).toISOString();
  const noteId = reply
    ? await addNote(deps.db, host, owner, nowMs, true)
    : null;
  const [{ id }] = await deps.db.query<{ id: string }>(
    `insert into flights (kind, bird_id, owner_id, counterpart_id, note_id,
       from_lat, from_lon, from_label, to_lat, to_lon, to_label,
       status, release_at, arrive_at, landed_at, created_at)
     select 'return', $1, o.id, h.id, $2,
       h.home_lat, h.home_lon, h.home_label, o.home_lat, o.home_lon, o.home_label,
       $3, $4, $4, case when $3 = 'landed' then $4::timestamptz end, $4
     from profiles o, profiles h
     where o.id = $5 and h.id = $6
     returning id`,
    [birdId, noteId, status, now, owner.id, host.id],
  );
  return { flightId: id, atMs: nowMs };
}

function returnLanded(flightId: string, owner: Person = world.max) {
  return rfc1149.apply(deps.db, {
    kind: "return-landed",
    flightId,
    ownerId: owner.id,
  });
}

async function addBird(owner: Person) {
  await deps.db.query(
    `insert into birds (owner_id, name, look, speed_mph, focus, navigation,
       belly, feathers, energy, care_at, last_fed_at, hatched_at)
     select owner_id, 'Extra', look, speed_mph, focus, navigation,
       belly, feathers, energy, care_at, last_fed_at, hatched_at
     from birds where id = $1`,
    [owner.birds[0].id],
  );
}

const setSearchParty = (flightId: string, outcome: "found" | "not_found") =>
  deps.db.query("update flights set search_party = $2 where id = $1", [
    flightId,
    outcome,
  ]);

const setTimezone = (person: Person, tz: string) =>
  deps.db.query("update profiles set timezone = $2 where id = $1", [
    person.id,
    tz,
  ]);

describe("rfc-1149", () => {
  it("rfc-1149: progress counts landed reply returns and earns at the goal, once", async () => {
    const goal = goalOf("rfc-1149");
    expect(goal).toBe(9);

    let earnedAt: Date | null = null;
    for (let n = 1; n <= goal + 1; n++) {
      const { flightId, atMs } = await addReturn(world.max, world.priya);
      await returnLanded(flightId);
      if (n === goal) earnedAt = new Date(atMs);
      expect(await badge(world.max.id, "rfc-1149")).toEqual({
        progress: n,
        earned_at: n >= goal ? earnedAt : null,
      });
    }
  });

  it("rfc-1149: not earned for empty, unlanded or other owners' returns", async () => {
    const goal = goalOf("rfc-1149");
    for (let n = 1; n < goal; n++) {
      await returnLanded((await addReturn(world.max, world.priya)).flightId);
    }
    const empty = await addReturn(world.max, world.priya, { reply: false });
    await returnLanded(empty.flightId);
    const flying = await addReturn(world.max, world.priya, {
      status: "flying",
    });
    await returnLanded(flying.flightId);
    const others = await addReturn(world.priya, world.max);
    await returnLanded(others.flightId, world.priya);
    await returnLanded(others.flightId);

    expect(await badge(world.max.id, "rfc-1149")).toEqual({
      progress: goal - 1,
      earned_at: null,
    });
    expect(await badge(world.priya.id, "rfc-1149")).toEqual({
      progress: 1,
      earned_at: null,
    });
  });

  it("rfc-1149: a delivery landing catches up on reply returns", async () => {
    await addReturn(world.max, world.priya);
    await addReturn(world.max, world.rosa);
    await landDelivery();
    expect(await badge(world.max.id, "rfc-1149")).toEqual({
      progress: 2,
      earned_at: null,
    });
  });
});

describe("early-bird", () => {
  const JULY_0630_NEW_YORK = Date.UTC(2026, 6, 15, 10, 30);
  const JULY_0700_NEW_YORK = Date.UTC(2026, 6, 15, 11, 0);
  const JULY_0030_NEW_YORK = Date.UTC(2026, 6, 15, 4, 30);
  const JULY_0130_NEW_YORK = Date.UTC(2026, 6, 15, 5, 30);
  const DECEMBER_0630_NEW_YORK = Date.UTC(2025, 11, 15, 11, 30);
  const JULY_1900_NEW_YORK = Date.UTC(2026, 6, 15, 23);
  const JULY_0015_APIA = Date.UTC(2026, 6, 14, 11, 15);
  const JULY_NOON_APIA = Date.UTC(2026, 6, 14, 23);
  const APIA = { lat: -13.83, lon: -171.76 };

  async function maxLoft() {
    const [loft] = await deps.db.query<{ lat: number; lon: number }>(
      "select home_lat as lat, home_lon as lon from profiles where id = $1",
      [world.max.id],
    );
    return loft;
  }

  async function moveLoft(person: Person, loft: { lat: number; lon: number }) {
    await deps.db.query(
      "update profiles set home_lat = $2, home_lon = $3 where id = $1",
      [person.id, loft.lat, loft.lon],
    );
  }

  async function expectEarned(flight: PlannedDelivery) {
    expect(await badge(world.max.id, "early-bird")).toEqual({
      progress: 1,
      earned_at: new Date(flight.arriveAtMs),
    });
  }

  it("early-bird: earned by a release before 7 am local and after sunrise at the loft", async () => {
    await expectEarned(await landDelivery({ releaseMs: JULY_0630_NEW_YORK }));
  });

  it("early-bird: earned by a release just after that day's sunrise at the loft", async () => {
    const { sunriseMs } = sunTimes(Date.UTC(2026, 6, 15, 16), await maxLoft());
    await expectEarned(
      await landDelivery({ releaseMs: sunriseMs + MINUTE_MS }),
    );
  });

  it("early-bird: earned on the loft's date when the owner's time zone is a day ahead", async () => {
    await setTimezone(world.max, "Asia/Bangkok");
    await expectEarned(await landDelivery({ releaseMs: JULY_1900_NEW_YORK }));
  });

  it("early-bird: not earned at 7 am exactly", async () => {
    await landDelivery({ releaseMs: JULY_0700_NEW_YORK });
    expect(await badge(world.max.id, "early-bird")).toBeNull();
  });

  it("early-bird: not earned by a release before sunrise", async () => {
    await landDelivery({ releaseMs: DECEMBER_0630_NEW_YORK });
    expect(await badge(world.max.id, "early-bird")).toBeNull();
  });

  it("early-bird: not earned after the loft's midnight and before that day's sunrise", async () => {
    await landDelivery({ releaseMs: JULY_0130_NEW_YORK });
    expect(await badge(world.max.id, "early-bird")).toBeNull();
  });

  it("early-bird: not earned half an hour after the loft's midnight", async () => {
    await landDelivery({ releaseMs: JULY_0030_NEW_YORK });
    expect(await badge(world.max.id, "early-bird")).toBeNull();
  });

  it("early-bird: not earned just after midnight at a loft whose time zone runs a day ahead of its longitude", async () => {
    await moveLoft(world.max, APIA);
    await setTimezone(world.max, "Pacific/Apia");
    await landDelivery({ releaseMs: JULY_0015_APIA });
    expect(await badge(world.max.id, "early-bird")).toBeNull();
  });

  it("early-bird: earned just after sunrise on the loft's date at a loft whose time zone runs a day ahead of its longitude", async () => {
    await moveLoft(world.max, APIA);
    await setTimezone(world.max, "Asia/Tokyo");
    const { sunriseMs } = sunTimes(JULY_NOON_APIA, APIA);
    await expectEarned(
      await landDelivery({ releaseMs: sunriseMs + MINUTE_MS }),
    );
  });

  it("early-bird: not earned when the owner's time zone puts the release after 7 am", async () => {
    await setTimezone(world.max, "Europe/London");
    await landDelivery({ releaseMs: JULY_0630_NEW_YORK });
    expect(await badge(world.max.id, "early-bird")).toBeNull();
  });
});

describe("search-and-rescue", () => {
  it("search-and-rescue: earned when a search party found the landing bird", async () => {
    const flight = await insertPlannedDelivery(
      deps.db,
      world,
      deps.clock.now(),
    );
    await setSearchParty(flight.flightId, "found");
    await land(flight);
    expect(await badge(world.max.id, "search-and-rescue")).toEqual({
      progress: 1,
      earned_at: new Date(flight.arriveAtMs),
    });
  });

  it("search-and-rescue: not earned when the search party failed or never ran", async () => {
    const failed = await insertPlannedDelivery(
      deps.db,
      world,
      deps.clock.now(),
    );
    await setSearchParty(failed.flightId, "not_found");
    await land(failed);
    await landDelivery();
    expect(await badge(world.max.id, "search-and-rescue")).toBeNull();
    expect(await badge(world.priya.id, "search-and-rescue")).toBeNull();
  });
});

describe("full-house", () => {
  it("full-house: progress counts birds owned and earns at the goal, once", async () => {
    const goal = goalOf("full-house");
    expect(goal).toBe(5);
    await deps.db.query("delete from birds where id = $1", [
      world.max.birds[1].id,
    ]);

    let earnedAt: Date | null = null;
    for (let n = 1; n <= goal + 1; n++) {
      if (n > 1) await addBird(world.max);
      const flight = await landDelivery();
      if (n === goal) earnedAt = new Date(flight.arriveAtMs);
      expect(await badge(world.max.id, "full-house")).toEqual({
        progress: n,
        earned_at: n >= goal ? earnedAt : null,
      });
    }
  });

  it("full-house: not earned at one bird short, and other people's birds do not count", async () => {
    const goal = goalOf("full-house");
    for (let n = world.max.birds.length; n < goal - 1; n++)
      await addBird(world.max);
    for (let n = 0; n < 3; n++) await addBird(world.priya);
    await landDelivery();
    expect(await badge(world.max.id, "full-house")).toEqual({
      progress: goal - 1,
      earned_at: null,
    });
  });
});
