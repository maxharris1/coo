import { beforeEach, describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import { computeFlightPlan, type FlightInput } from "@/lib/flight/engine";
import { foundObjectFor } from "@/lib/game/jobs";
import type { UserId } from "@/server/ports/auth";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { addNote } from "@/test/fixtures/notes";
import { seedWorld, type World } from "@/test/seedWorld";
import { buy } from "../shop";
import { tick } from "../tick";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const CHANCE = config.game.foundOnReturn.chance;

let deps: TestDeps;
let world: World;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
});

const iso = (ms: number) => new Date(ms).toISOString();

function uuidFor(n: number) {
  return `00000000-0000-4000-9000-${n.toString(16).padStart(12, "0")}`;
}

function idWhere(test: (id: string) => boolean) {
  for (let n = 1; ; n++) if (test(uuidFor(n))) return uuidFor(n);
}

const finds = (id: string) => foundObjectFor(id, CHANCE) !== null;
const NO_FIND_ID = idWhere((id) => !finds(id));
const FIND_ID = idWhere(finds);

type Return = {
  flightId: string;
  noteId: string | null;
  birdId: string;
  arriveAtMs: number;
  distanceMi: number;
};

async function insertReturn(
  opts: { withNote: boolean; id?: string } = { withNote: true },
): Promise<Return> {
  const nowMs = deps.clock.now();
  const owner = world.max;
  const host = world.priya;
  const birdId = owner.birds[0].id;
  return deps.db.tx(async (t) => {
    const noteId = opts.withNote
      ? await addNote(t, host, owner, nowMs, false)
      : null;
    const [f] = await t.query<{
      id: string;
      from_lat: number;
      from_lon: number;
      to_lat: number;
      to_lon: number;
    }>(
      `insert into flights (id, kind, bird_id, owner_id, counterpart_id, note_id,
         from_lat, from_lon, from_label, to_lat, to_lon, to_label,
         status, release_at, arrive_at, created_at)
       select coalesce($1::uuid, gen_random_uuid()), 'return', $6, o.id, h.id, $2,
         h.home_lat, h.home_lon, h.home_label, o.home_lat, o.home_lon, o.home_label,
         'flying', $3, $3, $3
       from profiles o, profiles h
       where o.id = $4 and h.id = $5
       returning id, from_lat, from_lon, to_lat, to_lon`,
      [opts.id ?? null, noteId, iso(nowMs), owner.id, host.id, birdId],
    );
    const [b] = await t.query<{
      speed_mph: number;
      focus: number;
      navigation: number;
      breed: string;
      gear: string[];
    }>(
      "select speed_mph, focus, navigation, breed, gear from birds where id = $1",
      [birdId],
    );
    const sample = config.game.weather.fallback;
    const input: FlightInput = {
      flightId: f.id,
      from: { lat: f.from_lat, lon: f.from_lon },
      to: { lat: f.to_lat, lon: f.to_lon },
      departAtMs: nowMs,
      bird: {
        speedMph: Number(b.speed_mph),
        focus: b.focus,
        navigation: b.navigation,
        breed: b.breed,
        level: 1,
        belly: 80,
        feathers: 80,
        energy: 100,
        sulking: false,
      },
      gear: b.gear,
      weather: [sample, sample, sample],
    };
    const plan = computeFlightPlan(input);
    await t.query(
      `update flights set arrive_at = $2, distance_mi = $3, odds = $4, delay_kind = $5,
         input = $6, plan = $7
       where id = $1`,
      [
        f.id,
        iso(plan.arriveAtMs),
        plan.distanceMi,
        plan.onTimeOdds,
        plan.delayKind,
        JSON.stringify(input),
        JSON.stringify(plan),
      ],
    );
    await t.query("update birds set status = 'visiting' where id = $1", [
      birdId,
    ]);
    return {
      flightId: f.id,
      noteId,
      birdId,
      arriveAtMs: plan.arriveAtMs,
      distanceMi: plan.distanceMi,
    };
  });
}

async function rows<T>(sql: string, params: unknown[] = []) {
  return deps.db.query<T>(sql, params);
}

const SNAPSHOT_TABLES = [
  "flights",
  "notes",
  "birds",
  "seed_ledger",
  "profiles",
  "badges",
  "found_objects",
  "notifications",
  "events",
];

async function snapshot() {
  const out: Record<string, unknown[]> = {};
  for (const table of SNAPSHOT_TABLES)
    out[table] = await rows(`select * from ${table} order by 1, 2`);
  return out;
}

async function notifications() {
  return rows<{
    user_id: string;
    kind: string;
    ref_id: string;
    title: string;
    body: string;
    url: string;
  }>(
    "select user_id, kind, ref_id, title, body, url from notifications order by kind",
  );
}

describe("landing a return", () => {
  it("does nothing before the arrival time", async () => {
    const r = await insertReturn();
    deps.clock.set(r.arriveAtMs - MINUTE_MS);
    const before = await snapshot();

    const result = await tick(deps);

    expect(result.counts.landReturns).toBe(0);
    expect(await snapshot()).toEqual(before);
  });

  it("scenario 1: Gerald is home, Max has the reply and 5 more seeds, and both are told once", async () => {
    const r = await insertReturn({ withNote: true, id: NO_FIND_ID });
    const [{ seeds: seedsBefore }] = await rows<{ seeds: number }>(
      "select seeds from profiles where id = $1",
      [world.max.id],
    );
    const [birdBefore] = await rows<{ miles: number }>(
      "select miles from birds where id = $1",
      [r.birdId],
    );
    deps.clock.set(r.arriveAtMs + 5 * MINUTE_MS);

    const result = await tick(deps);

    expect(result.counts.landReturns).toBe(1);
    const [f] = await rows<{ status: string; landed_at: Date }>(
      "select status, landed_at from flights where id = $1",
      [r.flightId],
    );
    expect(f.status).toBe("landed");
    expect(f.landed_at.toISOString()).toBe(iso(r.arriveAtMs));

    const [bird] = await rows<{ status: string; miles: number; care_at: Date }>(
      "select status, miles, care_at from birds where id = $1",
      [r.birdId],
    );
    expect(bird.status).toBe("home");
    expect(Number(bird.miles)).toBeCloseTo(
      Number(birdBefore.miles) + r.distanceMi,
      1,
    );
    expect(bird.care_at.toISOString()).toBe(iso(r.arriveAtMs));

    const [note] = await rows<{ delivered_at: Date }>(
      "select delivered_at from notes where id = $1",
      [r.noteId],
    );
    expect(note.delivered_at.toISOString()).toBe(iso(r.arriveAtMs));

    expect(
      await rows(
        "select user_id, reason, delta from seed_ledger where ref_id = $1",
        [r.flightId],
      ),
    ).toEqual([{ user_id: world.max.id, reason: "reply_home", delta: 5 }]);
    const [{ seeds }] = await rows<{ seeds: number }>(
      "select seeds from profiles where id = $1",
      [world.max.id],
    );
    expect(seeds).toBe(seedsBefore + 5);

    expect(await notifications()).toEqual([
      {
        user_id: world.priya.id,
        kind: "reply-delivered",
        ref_id: r.flightId,
        title: "Gerald made it home",
        body: "Max has your reply.",
        url: `/shoebox?friend=${world.max.id}`,
      },
      {
        user_id: world.max.id,
        kind: "reply-home",
        ref_id: r.flightId,
        title: "Gerald is home, with a reply",
        body: "Priya wrote back. It rode home free.",
        url: `/shoebox?friend=${world.priya.id}`,
      },
    ]);
  });

  it("emits the return-landed badge event for the flight", async () => {
    const { badgeRules } = await import("../badges");
    const seen: unknown[] = [];
    const original = badgeRules["rfc-1149"].apply;
    badgeRules["rfc-1149"].apply = async (_db, event) => {
      seen.push(event);
    };
    try {
      const r = await insertReturn({ withNote: true });
      deps.clock.set(r.arriveAtMs);
      await tick(deps);
      const empty = await insertReturn({ withNote: false });
      deps.clock.set(empty.arriveAtMs);
      await tick(deps);

      expect(seen).toEqual([
        { kind: "return-landed", flightId: r.flightId, ownerId: world.max.id },
      ]);
    } finally {
      badgeRules["rfc-1149"].apply = original;
    }
  });

  it("scenario 2's landing: an empty return sets the bird home and notifies home-empty only", async () => {
    const r = await insertReturn({ withNote: false, id: NO_FIND_ID });
    const [{ seeds: seedsBefore }] = await rows<{ seeds: number }>(
      "select seeds from profiles where id = $1",
      [world.max.id],
    );
    deps.clock.set(r.arriveAtMs);

    await tick(deps);

    const [bird] = await rows<{ status: string }>(
      "select status from birds where id = $1",
      [r.birdId],
    );
    expect(bird.status).toBe("home");
    expect(
      await rows("select * from seed_ledger where ref_id = $1", [r.flightId]),
    ).toEqual([]);
    const [{ seeds }] = await rows<{ seeds: number }>(
      "select seeds from profiles where id = $1",
      [world.max.id],
    );
    expect(seeds).toBe(seedsBefore);
    expect(await notifications()).toEqual([
      {
        user_id: world.max.id,
        kind: "home-empty",
        ref_id: r.flightId,
        title: "Gerald is home",
        body: "No reply this time. They are pretending not to mind.",
        url: "/",
      },
    ]);
  });

  it("a second tick, or a second landing of the same flight, changes nothing", async () => {
    const r = await insertReturn({ withNote: true, id: FIND_ID });
    deps.clock.set(r.arriveAtMs);
    await tick(deps);
    const once = await snapshot();
    const pushes = deps.push.sent.length;

    await tick(deps);
    expect(await snapshot()).toEqual(once);

    await rows(
      "update flights set status = 'flying', landed_at = null where id = $1",
      [r.flightId],
    );
    await tick(deps);

    const [ledger] = await rows<{ n: number }>(
      "select count(*)::int as n from seed_ledger where reason = 'reply_home'",
    );
    expect(ledger.n).toBe(1);
    const [found] = await rows<{ n: number }>(
      "select count(*)::int as n from found_objects where source_id = $1",
      [r.flightId],
    );
    expect(found.n).toBe(1);
    expect(await notifications()).toHaveLength(2);
    expect(deps.push.sent.length).toBe(pushes);
  });

  it("keeps home recovery from arrival when a birdbath purchase settles the return before the tick", async () => {
    const r = await insertReturn({ withNote: false });
    await rows("update birds set energy = 70, care_at = $2 where id = $1", [
      r.birdId,
      iso(deps.clock.now()),
    ]);
    await rows("select apply_seeds($1, $2, 'test', null)", [
      world.max.id,
      config.game.loftItems.find((i) => i.id === "birdbath")!.price,
    ]);
    deps.clock.set(r.arriveAtMs + HOUR_MS);

    await buy(deps, world.max.id as UserId, {
      itemId: "birdbath",
      price: config.game.loftItems.find((i) => i.id === "birdbath")!.price,
    });
    await tick(deps);

    const [bird] = await rows<{ status: string; energy: number }>(
      "select status, energy from birds where id = $1",
      [r.birdId],
    );
    expect(bird.status).toBe("home");
    expect(Number(bird.energy)).toBe(65.4);
  });

  it("leaves another user's return alone in a scoped tick", async () => {
    const r = await insertReturn();
    deps.clock.set(r.arriveAtMs);
    const before = await snapshot();

    const result = await tick(deps, { userId: world.rosa.id });

    expect(result.counts.landReturns).toBe(0);
    expect(await snapshot()).toEqual(before);
  });
});

describe("found object on a return", () => {
  it("appears for a flight id whose hash says so, with the object the hash names", async () => {
    const r = await insertReturn({ withNote: false, id: FIND_ID });
    deps.clock.set(r.arriveAtMs);
    await tick(deps);
    const object = foundObjectFor(FIND_ID, CHANCE)!;

    expect(
      await rows(
        "select user_id, bird_id, object_id, value, source_id, found_at from found_objects",
      ),
    ).toEqual([
      {
        user_id: world.max.id,
        bird_id: r.birdId,
        object_id: object.id,
        value: object.value,
        source_id: FIND_ID,
        found_at: new Date(r.arriveAtMs),
      },
    ]);
  });

  it("does not appear for a flight id whose hash says no", async () => {
    const r = await insertReturn({ withNote: false, id: NO_FIND_ID });
    deps.clock.set(r.arriveAtMs);
    await tick(deps);

    expect(await rows("select * from found_objects")).toEqual([]);
  });

  it("never appears twice when one return flight lands more than once", async () => {
    const r = await insertReturn({ withNote: false, id: FIND_ID });
    deps.clock.set(r.arriveAtMs);
    await tick(deps);
    for (let i = 0; i < 2; i++) {
      await rows(
        "update flights set status = 'flying', landed_at = null where id = $1",
        [r.flightId],
      );
      await rows("update birds set status = 'visiting' where id = $1", [
        r.birdId,
      ]);
      await tick(deps);
    }

    const found = await rows<{ source_id: string }>(
      "select source_id from found_objects",
    );
    expect(found).toEqual([{ source_id: FIND_ID }]);
  });
});
