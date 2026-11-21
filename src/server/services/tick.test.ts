import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { seedWorld, type World } from "@/test/seedWorld";
import { tick, type Step } from "./tick";
import type { guestLanding } from "./tick/guestLanding";

const spies = vi.hoisted(() => ({
  landReturns: vi.fn<Step>(async () => ({ count: 0 })),
  finishJobs: vi.fn<Step>(async () => ({ count: 0 })),
  guestLanding: vi.fn<typeof guestLanding>(async () => {}),
}));

vi.mock("./tick/landReturns", () => ({ landReturns: spies.landReturns }));
vi.mock("./tick/finishJobs", () => ({ finishJobs: spies.finishJobs }));
vi.mock("./tick/guestLanding", () => ({ guestLanding: spies.guestLanding }));

const STEP_ORDER = [
  "scheduleReleases",
  "landDeliveries",
  "endVisits",
  "landReturns",
  "delayNotices",
  "roostNotices",
  "finishJobs",
  "wakeBirds",
  "hungryNotices",
  "expireGuestLinks",
  "flushQuietHours",
];

let deps: TestDeps;
let world: World;

beforeEach(async () => {
  vi.clearAllMocks();
  spies.landReturns.mockImplementation(async () => ({ count: 0 }));
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
});

describe("tick", () => {
  it("runs all eleven steps in docs/06 order with zero counts when nothing is due", async () => {
    const result = await tick(deps);

    expect(result.timedOut).toBe(false);
    expect(Object.keys(result.counts)).toEqual(STEP_ORDER);
    expect(Object.values(result.counts)).toEqual(STEP_ORDER.map(() => 0));
  });

  it("returns zero counts when scoped to one user", async () => {
    const result = await tick(deps, { userId: world.max.id });

    expect(result).toEqual({
      counts: Object.fromEntries(STEP_ORDER.map((s) => [s, 0])),
      timedOut: false,
    });
  });

  it("stops before later steps once a looping step passes the 20 second budget", async () => {
    spies.landReturns.mockImplementation(async (ctx) => {
      let count = 0;
      for (let i = 0; i < 3; i++) {
        deps.clock.advance(7_000);
        await Promise.resolve();
        count++;
        if (ctx.timeUp()) break;
      }
      return { count };
    });

    const result = await tick(deps);

    expect(result.timedOut).toBe(true);
    expect(result.counts).toEqual({
      scheduleReleases: 0,
      landDeliveries: 0,
      endVisits: 0,
      landReturns: 3,
    });
    expect(spies.finishJobs).not.toHaveBeenCalled();
  });

  it("passes the caller's id and the row limit to each step", async () => {
    await tick(deps, { userId: world.max.id });

    expect(spies.landReturns).toHaveBeenCalledWith(
      expect.objectContaining({ userId: world.max.id, limit: 50, deps }),
    );
  });

  it("calls the guest landing hook from land deliveries", async () => {
    await tick(deps);

    expect(spies.guestLanding).toHaveBeenCalledTimes(1);
    expect(spies.guestLanding).toHaveBeenCalledWith(expect.anything(), []);
  });
});
