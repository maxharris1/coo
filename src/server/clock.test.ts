import { afterEach, describe, expect, it, vi } from "vitest";
import { clockSource, offsetClock } from "./clock";
import { FakeClock } from "@/test/fakes/clock";
import { testDb } from "@/test/testDb";
import type { Db } from "./db";

const T0 = 1_800_000_000_000;
const HOUR = 3_600_000;

async function dbWithOffset(offsetMs: number): Promise<Db> {
  const db = await testDb();
  await db.query("update dev_clock set offset_ms = $1", [offsetMs]);
  return db;
}

describe("FakeClock", () => {
  it("advance moves now()", () => {
    const clock = new FakeClock(T0);
    clock.advance(500);
    expect(clock.now()).toBe(T0 + 500);
  });

  it("set replaces now()", () => {
    const clock = new FakeClock(T0);
    clock.set(1000);
    clock.advance(500);
    expect(clock.now()).toBe(1500);
  });
});

describe("clockSource", () => {
  afterEach(() => vi.restoreAllMocks());

  it("production ignores a non-zero dev_clock offset and never reads it", async () => {
    vi.spyOn(Date, "now").mockReturnValue(T0);
    const db = await dbWithOffset(HOUR);
    const query = vi.spyOn(db, "query");
    const clock = await clockSource("production")(db);
    expect(clock.now()).toBe(T0);
    expect(query).not.toHaveBeenCalled();
  });

  it.each(["development", "preview"] as const)(
    "%s adds the dev_clock offset",
    async (env) => {
      vi.spyOn(Date, "now").mockReturnValue(T0);
      const clock = await clockSource(env)(await dbWithOffset(HOUR));
      expect(clock.now()).toBe(T0 + HOUR);
    },
  );

  it("caches the offset for 5 seconds", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(T0);
    const db = await dbWithOffset(HOUR);
    const source = clockSource("development");
    expect((await source(db)).now()).toBe(T0 + HOUR);

    await db.query("update dev_clock set offset_ms = $1", [2 * HOUR]);
    now.mockReturnValue(T0 + 4_999);
    expect((await source(db)).now()).toBe(T0 + 4_999 + HOUR);

    now.mockReturnValue(T0 + 5_000);
    expect((await source(db)).now()).toBe(T0 + 5_000 + 2 * HOUR);
  });
});

describe("offsetClock", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reads system time on every call", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(T0);
    const clock = offsetClock(10);
    expect(clock.now()).toBe(T0 + 10);
    now.mockReturnValue(T0 + 1);
    expect(clock.now()).toBe(T0 + 11);
  });
});
