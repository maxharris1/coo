import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "@/lib/config";
import type { Db } from "@/server/db";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { seedWorld, type World } from "@/test/seedWorld";
import { tick } from "../tick";

const MINUTE_MS = 60_000;
const care = config.game.care;

let deps: TestDeps;
let world: World;
let gerald: string;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
  gerald = world.max.birds[0].id;
});

afterEach(() => vi.restoreAllMocks());

function failQueryInTx(match: (sql: string, params?: unknown[]) => boolean) {
  const tx = deps.db.tx.bind(deps.db);
  return vi
    .spyOn(deps.db, "tx")
    .mockImplementation(<T>(fn: (db: Db) => Promise<T>) =>
      tx((t) =>
        fn({
          ...t,
          query: <R>(sql: string, params?: unknown[]) =>
            match(sql, params)
              ? t.query<R>("select 1 / 0")
              : t.query<R>(sql, params),
        }),
      ),
    );
}

async function rest(
  id: string,
  kind: "bath" | "nap",
  minutes: number,
  values: { feathers: number; energy: number },
) {
  const now = deps.clock.now();
  await deps.db.query(
    `update birds set status = 'busy', busy_kind = $2,
       busy_until = to_timestamp($3 / 1000.0), feathers = $4, energy = $5,
       care_at = to_timestamp($6 / 1000.0)
     where id = $1`,
    [id, kind, now + minutes * MINUTE_MS, values.feathers, values.energy, now],
  );
  return now + minutes * MINUTE_MS;
}

async function bird(id: string) {
  const [row] = await deps.db.query<{
    status: string;
    busy_kind: string | null;
    busy_until: Date | null;
    feathers: string;
    energy: string;
    care_at: Date;
  }>(
    "select status, busy_kind, busy_until, feathers, energy, care_at from birds where id = $1",
    [id],
  );
  return {
    ...row,
    feathers: Number(row.feathers),
    energy: Number(row.energy),
  };
}

describe("wake birds", () => {
  it("leaves a bird whose bath has not ended busy", async () => {
    const until = await rest(gerald, "bath", care.bathMinutes, {
      feathers: 20,
      energy: 60,
    });
    deps.clock.set(until - MINUTE_MS);

    const { counts } = await tick(deps);

    expect(counts.wakeBirds).toBe(0);
    expect(await bird(gerald)).toMatchObject({
      status: "busy",
      busy_kind: "bath",
      feathers: 20,
    });
  });

  it("sets feathers to 100 and the bird home when a bath ends", async () => {
    const until = await rest(gerald, "bath", care.bathMinutes, {
      feathers: 20,
      energy: 60,
    });
    deps.clock.set(until + 5 * MINUTE_MS);

    const { counts } = await tick(deps);

    expect(counts.wakeBirds).toBe(1);
    const woke = await bird(gerald);
    expect(woke).toMatchObject({
      status: "home",
      busy_kind: null,
      busy_until: null,
      feathers: care.full,
    });
    expect(woke.care_at.getTime()).toBe(until);
  });

  it("adds 50 energy at the end of a nap", async () => {
    const until = await rest(gerald, "nap", care.napMinutes, {
      feathers: 60,
      energy: 20,
    });
    deps.clock.set(until + MINUTE_MS);

    const { counts } = await tick(deps);

    const regained = care.energyHomePerHour * (care.napMinutes / 60);
    expect(counts.wakeBirds).toBe(1);
    expect(await bird(gerald)).toMatchObject({
      status: "home",
      busy_kind: null,
      energy: 20 + regained + care.napEnergy,
    });
  });

  it("applies a nap once when the tick runs twice", async () => {
    const until = await rest(gerald, "nap", care.napMinutes, {
      feathers: 60,
      energy: 20,
    });
    deps.clock.set(until + MINUTE_MS);

    await tick(deps);
    const once = await bird(gerald);
    const again = await tick(deps);

    expect(again.counts.wakeBirds).toBe(0);
    expect(await bird(gerald)).toEqual(once);
  });

  it("leaves a bird busy on a job alone", async () => {
    const until = await rest(gerald, "nap", 1, { feathers: 60, energy: 20 });
    await deps.db.query("update birds set busy_kind = 'job' where id = $1", [
      gerald,
    ]);
    deps.clock.set(until + MINUTE_MS);

    const { counts } = await tick(deps, { userId: world.max.id });

    expect(counts.wakeBirds).toBe(0);
    expect(await bird(gerald)).toMatchObject({
      status: "busy",
      busy_kind: "job",
    });
  });

  it("wakes only the given user's birds on a scoped tick", async () => {
    const kevin = world.priya.birds[0].id;
    const until = await rest(gerald, "bath", care.bathMinutes, {
      feathers: 20,
      energy: 60,
    });
    await rest(kevin, "bath", care.bathMinutes, { feathers: 20, energy: 60 });
    deps.clock.set(until + MINUTE_MS);

    const { counts } = await tick(deps, { userId: world.priya.id });

    expect(counts.wakeBirds).toBe(1);
    expect((await bird(kevin)).status).toBe("home");
    expect((await bird(gerald)).status).toBe("busy");
  });

  it("wakes the later birds and logs the failing bird id when one bird throws", async () => {
    const errorLines = vi.spyOn(console, "error").mockImplementation(() => {});
    const brenda = world.max.birds[1].id;
    const kevin = world.priya.birds[0].id;
    const values = { feathers: 20, energy: 60 };
    await rest(gerald, "bath", care.bathMinutes, values);
    await rest(brenda, "bath", care.bathMinutes + 1, values);
    const until = await rest(kevin, "bath", care.bathMinutes + 2, values);
    const failing = failQueryInTx(
      (sql, params) =>
        sql.includes("b.busy_kind in ('bath', 'nap')") &&
        params?.[0] === gerald,
    );
    deps.clock.set(until + MINUTE_MS);

    const result = await tick(deps);

    expect(result.counts.wakeBirds).toBe(2);
    expect(result.failed).toEqual({ wakeBirds: 1 });
    expect((await bird(gerald)).status).toBe("busy");
    expect((await bird(brenda)).status).toBe("home");
    expect((await bird(kevin)).status).toBe("home");
    expect(
      errorLines.mock.calls.map(([line]) => JSON.parse(line as string)),
    ).toEqual([
      expect.objectContaining({
        event: "tick.row_failed",
        step: "wakeBirds",
        rowId: gerald,
      }),
    ]);

    failing.mockRestore();
    const again = await tick(deps);
    expect(again.counts.wakeBirds).toBe(1);
    expect((await bird(gerald)).status).toBe("home");
  });
});
