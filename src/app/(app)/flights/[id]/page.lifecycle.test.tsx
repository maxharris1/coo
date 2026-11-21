import type { ReactElement } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import vectors from "../../../../../reference/flight-engine/vectors.json";
import type { SyncPayload } from "@/components/sync";
import type { SyncState } from "@/components/SyncProvider";
import { Tracker, trackerView } from "@/components/Tracker";
import {
  computeFlightPlan,
  positionAt,
  type FlightInput,
  type FlightPlan,
} from "@/lib/flight/engine";
import type { OnboardedCaller, Profile } from "@/server/auth";
import type { UserId } from "@/server/ports/auth";
import { getFlight } from "@/server/services/flights/get";
import { sendSearchParty } from "@/server/services/flights/searchParty";
import type { Flight } from "@/server/services/flights/shape";
import { sync } from "@/server/services/sync";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { FakeClock } from "@/test/fakes/clock";
import { insertPlannedDelivery } from "@/test/fixtures/plannedFlight";
import { seedWorld, type World } from "@/test/seedWorld";
import FlightPage from "./page";

const hooks = vi.hoisted(() => {
  type Effect = { deps?: unknown[]; cleanup?: () => void };
  const states: unknown[] = [];
  const effects: Effect[] = [];
  let pending: (() => void)[] = [];
  let s = 0;
  let e = 0;
  const changed = (prev: Effect | undefined, deps?: unknown[]) =>
    !prev || !deps || deps.some((d, j) => !Object.is(d, prev.deps?.[j]));
  return {
    id: "",
    sync: null as unknown,
    useState(init: unknown) {
      const k = s++;
      if (!(k in states))
        states[k] = typeof init === "function" ? init() : init;
      return [
        states[k],
        (v: unknown) => {
          states[k] = typeof v === "function" ? v(states[k]) : v;
        },
      ];
    },
    useEffect(fn: () => void | (() => void), deps?: unknown[]) {
      const k = e++;
      const prev = effects[k];
      if (!changed(prev, deps)) return;
      pending.push(() => {
        prev?.cleanup?.();
        effects[k] = { deps, cleanup: fn() ?? undefined };
      });
    },
    render<T>(component: () => T): T {
      s = 0;
      e = 0;
      pending = [];
      const out = component();
      for (const run of pending) run();
      return out;
    },
    reset() {
      for (const fx of effects) fx?.cleanup?.();
      states.length = 0;
      effects.length = 0;
    },
  };
});

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: hooks.useState,
  useEffect: hooks.useEffect,
}));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: hooks.id }) }));
vi.mock("@/components/SyncProvider", () => ({
  useSync: () => hooks.sync,
}));

const TZ = "America/New_York";
const SECOND = 1000;

let deps: TestDeps;
let world: World;
let caller: OnboardedCaller;
let fetches = 0;

function wire<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function storeMajorDelay(flightId: string): Promise<FlightPlan> {
  const v = vectors.vectors.find((x) => x.name === "delay-major");
  if (!v) throw new Error("vectors.json has no delay-major vector");
  const input = { ...(v.input as FlightInput), flightId: "vector-major-15" };
  const plan = computeFlightPlan(input);
  await deps.db.query(
    `update flights set input = $2, plan = $3, arrive_at = $4, delay_kind = $5
     where id = $1`,
    [
      flightId,
      JSON.stringify(input),
      JSON.stringify(plan),
      new Date(plan.arriveAtMs).toISOString(),
      plan.delayKind,
    ],
  );
  return plan;
}

async function readSync(): Promise<SyncPayload> {
  return wire({
    ...(await sync(deps, caller, TZ)),
    serverNow: deps.clock.now(),
  });
}

async function refreshSync() {
  deliverSync(await readSync());
}

function deliverSync(payload: SyncPayload) {
  hooks.sync = {
    data: payload,
    error: null,
    offsetMs: payload.serverNow - Date.now(),
    refresh: () => {},
  } satisfies SyncState;
}

function trackerFlight(): Flight | undefined {
  const el = hooks.render(FlightPage) as ReactElement<{ flight: Flight }>;
  return el.type === Tracker ? el.props.flight : undefined;
}

async function mounted(): Promise<Flight> {
  let flight: Flight | undefined;
  await vi.waitFor(() => {
    flight = trackerFlight();
    expect(flight, "page shows the tracker").toBeDefined();
  });
  return flight!;
}

beforeEach(async () => {
  const v = vectors.vectors.find((x) => x.name === "delay-major")!;
  const depart = (v.input as FlightInput).departAtMs;
  deps = await makeTestDeps({ clock: new FakeClock(depart) });
  world = await seedWorld(deps.db, depart);
  const { flightId } = await insertPlannedDelivery(deps.db, world, depart);
  hooks.id = flightId;
  const [profile] = await deps.db.query<Profile & { onboarded_at: Date }>(
    "select * from profiles where id = $1",
    [world.max.id],
  );
  caller = { userId: world.max.id as UserId, profile };
  const plan = await storeMajorDelay(flightId);
  const delay = plan.segments.find((s) => s.kind === "delay")!;
  deps.clock.set(delay.startMs);
  fetches = 0;
  vi.stubGlobal("fetch", async () => {
    fetches++;
    const flight = await getFlight(deps, caller.userId, hooks.id);
    return new Response(
      JSON.stringify({ flight, serverNow: deps.clock.now() }),
    );
  });
});

afterEach(() => {
  hooks.reset();
  vi.unstubAllGlobals();
});

it("hands the tracker the new arrival after a search party and a sync refresh", async () => {
  await refreshSync();
  const before = await mounted();

  deps.clock.set(deps.clock.now() + SECOND);
  const party = await sendSearchParty(deps, caller, hooks.id);
  expect(party.outcome).toBe("found");
  await refreshSync();

  const server = await getFlight(deps, caller.userId, hooks.id);
  expect(server.arriveAt).toBeLessThan(before.arriveAt!);
  const after = trackerFlight()!;
  expect(after.arriveAt, "tracker arrival").toBe(server.arriveAt);
  expect(after.plan).toEqual(server.plan);

  const oneSecondLate = server.arriveAt! + SECOND;
  expect(
    positionAt(server.plan!, server.from, server.to, oneSecondLate).state,
  ).toBe("landed");
  expect(trackerView(after, oneSecondLate, TZ).state).toBe("landed");
});

it("keeps a fetched flight that is newer than the last sync", async () => {
  await refreshSync();
  deps.clock.set(deps.clock.now() + SECOND);
  await sendSearchParty(deps, caller, hooks.id);
  deps.clock.set(deps.clock.now() + SECOND);

  const flight = await mounted();

  const server = await getFlight(deps, caller.userId, hooks.id);
  expect(flight.arriveAt, "tracker arrival").toBe(server.arriveAt);
  expect(fetches).toBe(1);
});

function stubSlowFetch(flight: Flight): () => void {
  let release = () => {};
  const arrived = new Promise<void>((resolve) => {
    release = resolve;
  });
  vi.stubGlobal("fetch", async () => {
    await arrived;
    return new Response(
      JSON.stringify({ flight: wire(flight), serverNow: deps.clock.now() }),
    );
  });
  return release;
}

it("keeps the synced search-party plan over a slower GET that read the old plan", async () => {
  await refreshSync();
  const oldRead = await getFlight(deps, caller.userId, hooks.id);
  const releaseGet = stubSlowFetch(oldRead);
  expect(trackerFlight(), "still loading").toBeUndefined();

  deps.clock.set(deps.clock.now() + SECOND);
  const party = await sendSearchParty(deps, caller, hooks.id);
  expect(party.outcome).toBe("found");
  await refreshSync();
  const syncStamp = (hooks.sync as SyncState).data!.serverNow;

  deps.clock.set(deps.clock.now() + SECOND);
  releaseGet();
  const flight = await mounted();

  const server = await getFlight(deps, caller.userId, hooks.id);
  expect(server.arriveAt).toBeLessThan(oldRead.arriveAt!);
  expect(syncStamp, "GET stamped after the sync").toBeLessThan(
    deps.clock.now(),
  );
  expect(flight.arriveAt, "tracker arrival").toBe(server.arriveAt);
  const oneSecondLate = server.arriveAt! + SECOND;
  expect(trackerView(flight, oneSecondLate, TZ).state).toBe("landed");
});

it("keeps a fetched search-party plan over a slower sync that read the old plan", async () => {
  await refreshSync();
  const oldSync = await readSync();

  deps.clock.set(deps.clock.now() + SECOND);
  const party = await sendSearchParty(deps, caller, hooks.id);
  expect(party.outcome).toBe("found");
  const fetched = await mounted();

  deps.clock.set(deps.clock.now() + SECOND);
  deliverSync({ ...oldSync, serverNow: deps.clock.now() });
  const flight = trackerFlight()!;

  const server = await getFlight(deps, caller.userId, hooks.id);
  expect(fetched.arriveAt).toBe(server.arriveAt);
  expect(flight.arriveAt, "tracker arrival").toBe(server.arriveAt);
  const oneSecondLate = server.arriveAt! + SECOND;
  expect(trackerView(flight, oneSecondLate, TZ).state).toBe("landed");
});
