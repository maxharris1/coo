import { beforeEach, describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import { startOfLocalDayMs } from "@/lib/game/time";
import type { UserId } from "@/server/ports/auth";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { addDelivery, HOUR_MS } from "@/test/fixtures/flights";
import { addNote } from "@/test/fixtures/notes";
import { seedWorld, type Person, type World } from "@/test/seedWorld";
import { listFlights, type FlightsPage } from "./list";

const NY = "America/New_York";
const MINUTE_MS = 60_000;

let deps: TestDeps;
let world: World;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
});

const page = (who: Person, cursor?: string, timezone = NY) =>
  listFlights(deps, { userId: who.id as UserId, timezone }, cursor);

const midnight = () => startOfLocalDayMs(deps.clock.now(), NY);

async function addBird(owner: Person, name: string): Promise<string> {
  const stats = config.game.start.birds[0];
  const now = new Date(deps.clock.now()).toISOString();
  const [{ id }] = await deps.db.query<{ id: string }>(
    `insert into birds (owner_id, name, speed_mph, focus, navigation,
       care_at, last_fed_at, hatched_at)
     values ($1, $2, $3, $4, $5, $6, $6, $6) returning id`,
    [owner.id, name, stats.speedMph, stats.focus, stats.navigation, now],
  );
  return id;
}

type Spec = {
  from: Person;
  to: Person;
  status: "flying" | "landed";
  releaseMs: number;
  arriveMs: number;
  birdId?: string;
};

async function fly({
  from,
  to,
  status,
  releaseMs,
  arriveMs,
  birdId = from.birds[0].id,
}: Spec): Promise<string> {
  return deps.db.tx(async (t) => {
    const noteId = await addNote(t, from, to, releaseMs, status === "landed");
    return addDelivery(
      t,
      from,
      to,
      birdId,
      noteId,
      status,
      releaseMs,
      arriveMs,
    );
  });
}

const landed = (from: Person, to: Person, landedMs: number) =>
  fly({
    from,
    to,
    status: "landed",
    releaseMs: landedMs - HOUR_MS,
    arriveMs: landedMs,
  });

const ids = (flights: { id: string }[]) => flights.map((f) => f.id);

const everyId = (p: FlightsPage) => [
  ...ids(p.yours),
  ...ids(p.incoming),
  ...ids(p.landedToday),
  ...ids(p.earlier),
];

async function walk(who: Person): Promise<FlightsPage[]> {
  const pages = [await page(who)];
  while (pages.at(-1)!.nextCursor && pages.length < 10) {
    pages.push(await page(who, pages.at(-1)!.nextCursor!));
  }
  return pages;
}

describe("listFlights", () => {
  it("sorts three out, one incoming and two landed today into sections", async () => {
    const { max, priya } = world;
    const now = deps.clock.now();
    const thirdBird = await addBird(max, "Dot");
    const arrivesLast = await fly({
      from: max,
      to: priya,
      status: "flying",
      releaseMs: now - HOUR_MS,
      arriveMs: now + 3 * HOUR_MS,
      birdId: thirdBird,
    });
    const scheduled = await fly({
      from: max,
      to: priya,
      status: "flying",
      releaseMs: now + 90 * MINUTE_MS,
      arriveMs: now + 5 * HOUR_MS,
      birdId: max.birds[1].id,
    });
    await deps.db.query(
      "update flights set status = 'scheduled', arrive_at = null where id = $1",
      [scheduled],
    );
    const arrivesFirst = await fly({
      from: max,
      to: priya,
      status: "flying",
      releaseMs: now - HOUR_MS,
      arriveMs: now + HOUR_MS,
      birdId: max.birds[0].id,
    });
    const incoming = await fly({
      from: priya,
      to: max,
      status: "flying",
      releaseMs: now - HOUR_MS,
      arriveMs: now + 2 * HOUR_MS,
    });
    const landedEarlierToday = await landed(priya, max, now - 3 * HOUR_MS);
    const landedLatest = await landed(max, priya, now - HOUR_MS);
    const landedYesterday = await landed(max, priya, midnight() - 4 * HOUR_MS);

    const p = await page(max);

    expect(ids(p.yours)).toEqual([arrivesFirst, scheduled, arrivesLast]);
    expect(ids(p.incoming)).toEqual([incoming]);
    expect(ids(p.landedToday)).toEqual([landedLatest, landedEarlierToday]);
    expect(ids(p.earlier)).toEqual([landedYesterday]);
    expect(everyId(p).filter((id) => id === landedYesterday)).toHaveLength(1);
    expect(p.nextCursor).toBeNull();
  });

  it("puts a flight landed before local midnight in Earlier, not Landed today", async () => {
    deps.clock.set(Date.UTC(2026, 10, 20, 5, 30));
    const { max, priya } = world;
    const beforeMidnight = await landed(
      max,
      priya,
      Date.UTC(2026, 10, 20, 4, 50),
    );
    const afterMidnight = await landed(
      max,
      priya,
      Date.UTC(2026, 10, 20, 5, 10),
    );

    const p = await page(max, undefined, NY);

    expect(ids(p.landedToday)).toEqual([afterMidnight]);
    expect(ids(p.earlier)).toEqual([beforeMidnight]);
  });

  it("never returns Rosa's flights to Max", async () => {
    const { max, priya, rosa } = world;
    const now = deps.clock.now();
    const mine = await landed(max, priya, now - HOUR_MS);
    await fly({
      from: rosa,
      to: priya,
      status: "flying",
      releaseMs: now - HOUR_MS,
      arriveMs: now + HOUR_MS,
    });
    await landed(rosa, priya, now - HOUR_MS);
    await landed(rosa, priya, midnight() - 30 * HOUR_MS);

    expect(everyId(await page(max))).toEqual([mine]);
  });

  it.each([
    ["whole milliseconds", "0"],
    ["microseconds", "0.000500"],
  ])(
    "pages 65 older flights 30, 30, 5 with no repeats and no gaps at %s",
    async (_, extra) => {
      const { max, priya } = world;
      const base = midnight() - 2 * HOUR_MS;
      const releases = Array.from({ length: 65 }, (_, i) => base - i * HOUR_MS);
      releases[30] = releases[31] = releases[29];
      releases[60] = releases[59];
      const inserted: string[] = [];
      for (const releaseMs of releases) {
        inserted.push(
          await fly({
            from: max,
            to: priya,
            status: "landed",
            releaseMs,
            arriveMs: releaseMs + 30 * MINUTE_MS,
          }),
        );
      }

      await deps.db.query(
        "update flights set release_at = release_at + $1::interval",
        [`${extra} second`],
      );

      const pages = await walk(max);
      const earlier = pages.flatMap((p) => p.earlier);

      expect(pages.map((p) => p.earlier.length)).toEqual([30, 30, 5]);
      expect(new Set(ids(earlier)).size).toBe(65);
      expect([...ids(earlier)].sort()).toEqual([...inserted].sort());
      for (const [i, f] of earlier.slice(1).entries()) {
        const prev = earlier[i];
        const descending =
          prev.releaseAt > f.releaseAt ||
          (prev.releaseAt === f.releaseAt && prev.id > f.id);
        expect(descending, `${prev.id} before ${f.id}`).toBe(true);
      }
    },
  );

  it("keeps paging stable when a flight lands mid-walk", async () => {
    const { max, priya } = world;
    const base = midnight() - 2 * HOUR_MS;
    const inserted: string[] = [];
    for (let i = 0; i < 35; i++) {
      inserted.push(await landed(max, priya, base - i * HOUR_MS));
    }

    const first = await page(max);
    await landed(max, priya, midnight() - HOUR_MS);
    const second = await page(max, first.nextCursor!);

    expect(ids(first.earlier)).toEqual(inserted.slice(0, 30));
    expect(ids(second.earlier)).toEqual(inserted.slice(30));
    expect(second.nextCursor).toBeNull();
  });

  it("returns every one of 35 older flights released within one millisecond", async () => {
    const { max, priya } = world;
    const base = midnight() - 2 * HOUR_MS;
    const inserted: string[] = [];
    for (let i = 0; i < 35; i++) {
      inserted.push(await landed(max, priya, base - i * HOUR_MS));
    }
    await deps.db.query(
      `update flights f set release_at = $1::timestamptz + n * interval '1 microsecond'
       from (select id, row_number() over (order by release_at) as n from flights) r
       where r.id = f.id`,
      [new Date(base).toISOString()],
    );

    const pages = await walk(max);

    expect(pages.map((p) => ids(p.earlier))).toEqual([
      inserted.slice(0, 30),
      inserted.slice(30),
    ]);
  });

  it("accepts a cursor at the latest time it can carry", async () => {
    const cursor = Buffer.from(
      `${Number.MAX_SAFE_INTEGER}:00000000-0000-4000-8000-000000000001`,
    ).toString("base64url");

    const p = await page(world.max, cursor);

    expect(p.earlier).toEqual([]);
    expect(p.nextCursor).toBeNull();
  });

  it("shows a cancelled flight in its owner's Earlier only", async () => {
    const { max, priya } = world;
    const now = deps.clock.now();
    const cancelled = await fly({
      from: max,
      to: priya,
      status: "flying",
      releaseMs: now + HOUR_MS,
      arriveMs: now + 2 * HOUR_MS,
    });
    await deps.db.query(
      "update flights set status = 'cancelled', arrive_at = null where id = $1",
      [cancelled],
    );

    expect(ids((await page(max)).earlier)).toEqual([cancelled]);
    expect(everyId(await page(priya))).toEqual([]);
  });

  it.each([
    ["bad base64", "!!!not base64!!!"],
    ["missing parts", Buffer.from("1700000000000").toString("base64url")],
    [
      "non-integer time",
      Buffer.from("12.5:00000000-0000-4000-8000-000000000001").toString(
        "base64url",
      ),
    ],
    ["non-uuid id", Buffer.from("1700000000000:abc").toString("base64url")],
  ])("refuses a cursor with %s as invalid", async (_, cursor) => {
    await expect(page(world.max, cursor)).rejects.toMatchObject({
      code: "invalid",
    });
  });
});
