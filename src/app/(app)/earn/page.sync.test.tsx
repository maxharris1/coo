import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SyncContext, type SyncState } from "@/components/SyncProvider";
import type { SyncPayload } from "@/components/sync";
import { ToastContext } from "@/components/Toasts";
import { foundObjectFor, offersFor } from "@/lib/game/jobs";
import { jobPay } from "@/lib/game/seeds";
import { localDate } from "@/lib/game/time";
import type { OnboardedCaller, Profile } from "@/server/auth";
import type { UserId } from "@/server/ports/auth";
import { careAction } from "@/server/services/care";
import { earn } from "@/server/services/earn";
import { startJob } from "@/server/services/jobs/start";
import { sync } from "@/server/services/sync";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { seedWorld, type World } from "@/test/seedWorld";
import type { EarnState } from "./earn";
import EarnPage from "./page";

const states: EarnState[] = [];
const toast = () => {};

vi.mock("./EarnView", () => ({
  EarnView: ({ state }: { state: EarnState }) => {
    states.push(state);
    return null;
  },
}));

let deps: TestDeps;
let world: World;

async function callerFor(userId: string): Promise<OnboardedCaller> {
  const [profile] = await deps.db.query<Profile & { onboarded_at: Date }>(
    "select * from profiles where id = $1",
    [userId],
  );
  return { userId: userId as UserId, profile };
}

async function syncState(userId: string): Promise<SyncState> {
  const payload = await sync(deps, await callerFor(userId), null);
  return {
    data: JSON.parse(
      JSON.stringify({ ...payload, serverNow: 0, serverNowMono: 0 }),
    ) as SyncPayload,
    error: null,
    offsetMs: 0,
    refresh: () => {},
  };
}

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

beforeEach(async () => {
  states.length = 0;
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), { HTMLIFrameElement: class {} }),
  );
  vi.stubGlobal("document", new EventTarget());
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) !== "/api/earn") {
        throw new Error(`unexpected ${String(input)}`);
      }
      return Response.json(await earn(deps, await callerFor(world.max.id), {}));
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("shows the find and new allowance when a missed job completes with seeds back where they were", async () => {
  const max = world.max.id;
  const [gerald, brenda] = world.max.birds;
  await deps.db.query("update profiles set seeds = 60 where id = $1", [max]);
  const feedCost = deps.config.game.seeds.feedCost;
  const caller = await callerFor(max);
  const offer = cancellableOffer(max, caller.profile.timezone, feedCost);

  const opened = await syncState(max);
  const root = createRoot(
    Object.assign(new EventTarget(), {
      nodeType: 1,
      tagName: "DIV",
      ownerDocument: document,
    }) as unknown as Element,
  );
  await act(async () => root.render(page(opened)));
  await settle();
  expect(states.at(-1)).toMatchObject({ kind: "ready", found: [] });

  const { job } = await startJob(deps, caller, {
    jobId: offer.id,
    birdId: gerald.id,
  });
  const lucky = luckyJobId();
  await deps.db.query("update jobs set id = $2 where id = $1", [job.id, lucky]);
  for (let n = 0; n < job.pay / feedCost; n++) {
    await careAction(deps, await callerFor(max), brenda.id, "feed", null);
  }
  deps.clock.set(Date.parse(job.endsAt));
  const completed = await syncState(max);
  expect(completed.data?.me.seeds).toBe(opened.data?.me.seeds);

  await act(async () => root.render(page(completed)));
  await settle();

  const fresh = await earn(deps, await callerFor(max), {});
  expect(fresh.found).toHaveLength(1);
  expect(states.at(-1)).toMatchObject({
    kind: "ready",
    jobs: fresh.jobs,
    found: fresh.found,
  });

  await act(async () => root.unmount());
});

function cancellableOffer(userId: string, timezone: string, feedCost: number) {
  for (let day = 0; day < 30; day++) {
    const offer = offersFor(userId, localDate(deps.clock.now(), timezone)).find(
      (o) => {
        const pay = jobPay(o, 0);
        return pay.ok && pay.seeds % feedCost === 0;
      },
    );
    if (offer) return offer;
    deps.clock.advance(24 * 60 * 60_000);
  }
  throw new Error("no offer whose pay feeds can cancel");
}

function luckyJobId(): string {
  const chance = deps.config.game.jobs.foundObjectChance;
  for (let n = 1; n < 10_000; n++) {
    const id = `00000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
    if (foundObjectFor(id, chance) !== null) return id;
  }
  throw new Error("no job id with a find");
}

const page = (state: SyncState) => (
  <SyncContext.Provider value={state}>
    <ToastContext.Provider value={toast}>
      <EarnPage />
    </ToastContext.Provider>
  </SyncContext.Provider>
);
