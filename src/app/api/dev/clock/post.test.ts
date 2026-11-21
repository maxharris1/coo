import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncGet } from "@/app/api/sync/get";
import { clockSource } from "@/server/clock";
import { createJsonRoute } from "@/server/http";
import type { UserId } from "@/server/ports/auth";
import { onboard } from "@/server/services/onboarding";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { devClockBuild, devClockRoute } from "@/test/devClockRoute";
import { geoClient } from "@/test/geoRoute";
import { devClockPost } from "./post";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

let deps: TestDeps;
let clock: ReturnType<typeof geoClient>;
let sync: ReturnType<typeof geoClient>;

beforeEach(async () => {
  deps = await makeTestDeps();
  await deps.db.query("update dev_clock set offset_ms = 0");
  const jsonRoute = devClockRoute(deps);
  clock = geoClient(deps, devClockPost, "/api/dev/clock", jsonRoute);
  sync = geoClient(deps, syncGet, "/api/sync", jsonRoute);
});

afterEach(() => vi.restoreAllMocks());

const ref = () => crypto.randomUUID();

async function onboarded(number: string) {
  const session = await clock.signIn(number);
  await onboard(deps, session.id as UserId, {
    timezone: "America/New_York",
    name: "Max",
    bird: { name: "Gerald", look: "gerald", pronoun: "he" },
  });
  await deps.db.query(
    "update profiles set onboarded_at = to_timestamp($2 / 1000.0) where id = $1",
    [session.id, deps.clock.now()],
  );
  return session;
}

async function offset() {
  const [{ offset_ms }] = await deps.db.query<{ offset_ms: number }>(
    "select offset_ms from dev_clock",
  );
  return offset_ms;
}

describe("POST /api/dev/clock", () => {
  it("refuses a request without a session as 401", async () => {
    const { status, json } = await clock.post({ addMs: HOUR, ref: ref() });
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
    expect(await offset()).toBe(0);
  });

  it.each([
    ["an empty body", {}],
    ["a missing ref", { addMs: HOUR }],
    ["a non-uuid ref", { addMs: HOUR, ref: "retry-1" }],
    ["a reset without a ref", { reset: true }],
    ["a zero addMs", { addMs: 0, ref: ref() }],
    ["a negative addMs", { addMs: -HOUR, ref: ref() }],
    ["a fractional addMs", { addMs: 1.5, ref: ref() }],
    ["more than 30 days", { addMs: 30 * DAY + 1, ref: ref() }],
    ["reset: false", { reset: false, ref: ref() }],
    ["addMs and reset together", { addMs: HOUR, reset: true, ref: ref() }],
    ["an unknown key", { addMs: HOUR, ref: ref(), userId: "someone" }],
  ])("answers %s with 400 invalid", async (_, body) => {
    const { jar } = await onboarded("(555) 123-4567");
    const { status, json } = await clock.post(body, jar);
    expect(status).toBe(400);
    expect(json.error.code).toBe("invalid");
    expect(await offset()).toBe(0);
  });

  it("moves serverNow by exactly one hour in its own response and the next sync", async () => {
    const { jar } = await onboarded("(555) 123-4567");
    const start = deps.clock.now();
    const added = await clock.post({ addMs: HOUR, ref: ref() }, jar);
    expect(added.status).toBe(200);
    expect(added.json).toEqual({ offsetMs: HOUR, serverNow: start + HOUR });
    const next = await sync.get({}, jar);
    expect(next.status).toBe(200);
    expect(next.json.serverNow).toBe(start + HOUR);
  });

  it("adds to the offset already set", async () => {
    const { jar } = await onboarded("(555) 123-4567");
    await clock.post({ addMs: HOUR, ref: ref() }, jar);
    const { json } = await clock.post({ addMs: DAY, ref: ref() }, jar);
    expect(json).toEqual({
      offsetMs: HOUR + DAY,
      serverNow: deps.clock.now() + HOUR + DAY,
    });
  });

  it("resets the offset to zero", async () => {
    const { jar } = await onboarded("(555) 123-4567");
    const start = deps.clock.now();
    await clock.post({ addMs: DAY, ref: ref() }, jar);
    const reset = await clock.post({ reset: true, ref: ref() }, jar);
    expect(reset.json).toEqual({ offsetMs: 0, serverNow: start });
    expect((await sync.get({}, jar)).json.serverNow).toBe(start);
    const again = await clock.post({ reset: true, ref: ref() }, jar);
    expect(again.json.offsetMs).toBe(0);
  });

  it("applies a retried ref once and distinct refs separately", async () => {
    const { jar } = await onboarded("(555) 123-4567");
    const body = { addMs: HOUR, ref: ref() };
    expect((await clock.post(body, jar)).json.offsetMs).toBe(HOUR);
    const retry = await clock.post(body, jar);
    expect(retry.status).toBe(200);
    expect(retry.json.offsetMs).toBe(HOUR);
    expect(await offset()).toBe(HOUR);
    const next = await clock.post({ addMs: HOUR, ref: ref() }, jar);
    expect(next.json.offsetMs).toBe(2 * HOUR);
    expect(await offset()).toBe(2 * HOUR);
  });

  it("does not reset again when a reset is retried after a later add", async () => {
    const { jar } = await onboarded("(555) 123-4567");
    await clock.post({ addMs: DAY, ref: ref() }, jar);
    const reset = { reset: true, ref: ref() };
    expect((await clock.post(reset, jar)).json.offsetMs).toBe(0);
    await clock.post({ addMs: HOUR, ref: ref() }, jar);
    const retry = await clock.post(reset, jar);
    expect(retry.status).toBe(200);
    expect(retry.json.offsetMs).toBe(HOUR);
    expect(await offset()).toBe(HOUR);
  });

  it("applies the offset once when the response failed after commit and the client retries", async () => {
    const { jar } = await onboarded("(555) 123-4567");
    const start = deps.clock.now();
    const build = devClockBuild(deps);
    let builds = 0;
    const flaky = geoClient(
      deps,
      devClockPost,
      "/api/dev/clock",
      devClockRoute(deps, async () => {
        builds += 1;
        if (builds === 2) throw new Error("rebuild failed after commit");
        return build();
      }),
    );
    const body = { addMs: HOUR, ref: ref() };
    const failed = await flaky.post(body, jar);
    expect(failed.status).toBe(500);
    expect(await offset()).toBe(HOUR);
    const retry = await flaky.post(body, jar);
    expect(retry.status).toBe(200);
    expect(retry.json).toEqual({ offsetMs: HOUR, serverNow: start + HOUR });
    expect(await offset()).toBe(HOUR);
  });

  it("moves the next sync served by another prewarmed worker", async () => {
    const { jar } = await onboarded("(555) 123-4567");
    const start = deps.clock.now();
    vi.spyOn(Date, "now").mockReturnValue(start);
    const worker = () => {
      const source = clockSource("test");
      return async () => ({ ...deps, clock: await source(deps.db) });
    };
    const first = worker();
    const second = worker();
    await first();
    await second();
    const route = (build: ReturnType<typeof worker>) =>
      createJsonRoute(build, { appEnv: () => "test" });
    const poster = geoClient(
      deps,
      devClockPost,
      "/api/dev/clock",
      route(first),
    );
    const reader = geoClient(deps, syncGet, "/api/sync", route(second));
    const added = await poster.post({ addMs: HOUR, ref: ref() }, jar);
    expect(added.json.serverNow).toBe(start + HOUR);
    const next = await reader.get({}, jar);
    expect(next.status).toBe(200);
    expect(next.json.serverNow).toBe(start + HOUR);
  });
});
