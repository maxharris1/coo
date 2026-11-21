import { beforeEach, describe, expect, it } from "vitest";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { health, recordTick } from "./health";

const MINUTE = 60_000;

let deps: TestDeps;

beforeEach(async () => {
  deps = await makeTestDeps();
});

describe("health", () => {
  it("is stale with no age before any tick has finished", async () => {
    expect(await health(deps)).toEqual({
      lastTickAt: null,
      ageMs: null,
      stale: true,
    });
  });

  it("reports the age of the last good tick", async () => {
    const at = deps.clock.now();
    await recordTick(deps);
    deps.clock.advance(MINUTE);

    expect(await health(deps)).toEqual({
      lastTickAt: at,
      ageMs: MINUTE,
      stale: false,
    });
  });

  it("is fresh at exactly 5 minutes old", async () => {
    await recordTick(deps);
    deps.clock.advance(5 * MINUTE);

    expect((await health(deps)).stale).toBe(false);
  });

  it("is stale when the last tick is over 5 minutes old", async () => {
    await recordTick(deps);
    deps.clock.advance(5 * MINUTE + 1);

    expect(await health(deps)).toMatchObject({
      ageMs: 5 * MINUTE + 1,
      stale: true,
    });
  });

  it("becomes fresh again after the next tick", async () => {
    await recordTick(deps);
    deps.clock.advance(10 * MINUTE);
    await recordTick(deps);

    expect(await health(deps)).toMatchObject({ ageMs: 0, stale: false });
  });

  it("is safe to record twice and never moves the last tick backwards", async () => {
    const later = deps.clock.now();
    await recordTick(deps);
    await recordTick(deps);
    deps.clock.set(later - 2 * MINUTE);
    await recordTick(deps);
    deps.clock.set(later);

    expect((await health(deps)).lastTickAt).toBe(later);
  });
});
