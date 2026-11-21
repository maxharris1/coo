import { beforeEach, describe, expect, it } from "vitest";
import { syncGet } from "@/app/api/sync/get";
import type { UserId } from "@/server/ports/auth";
import { onboard } from "@/server/services/onboarding";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { devClockRoute } from "@/test/devClockRoute";
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
    const { status, json } = await clock.post({ addMs: HOUR });
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
    expect(await offset()).toBe(0);
  });

  it.each([
    ["an empty body", {}],
    ["a zero addMs", { addMs: 0 }],
    ["a negative addMs", { addMs: -HOUR }],
    ["a fractional addMs", { addMs: 1.5 }],
    ["more than 30 days", { addMs: 30 * DAY + 1 }],
    ["reset: false", { reset: false }],
    ["addMs and reset together", { addMs: HOUR, reset: true }],
    ["an unknown key", { addMs: HOUR, userId: "someone" }],
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
    const added = await clock.post({ addMs: HOUR }, jar);
    expect(added.status).toBe(200);
    expect(added.json).toEqual({ offsetMs: HOUR, serverNow: start + HOUR });
    const next = await sync.get({}, jar);
    expect(next.status).toBe(200);
    expect(next.json.serverNow).toBe(start + HOUR);
  });

  it("adds to the offset already set", async () => {
    const { jar } = await onboarded("(555) 123-4567");
    await clock.post({ addMs: HOUR }, jar);
    const { json } = await clock.post({ addMs: DAY }, jar);
    expect(json).toEqual({
      offsetMs: HOUR + DAY,
      serverNow: deps.clock.now() + HOUR + DAY,
    });
  });

  it("resets the offset to zero", async () => {
    const { jar } = await onboarded("(555) 123-4567");
    const start = deps.clock.now();
    await clock.post({ addMs: DAY }, jar);
    const reset = await clock.post({ reset: true }, jar);
    expect(reset.json).toEqual({ offsetMs: 0, serverNow: start });
    expect((await sync.get({}, jar)).json.serverNow).toBe(start);
    expect((await clock.post({ reset: true }, jar)).json.offsetMs).toBe(0);
  });
});
