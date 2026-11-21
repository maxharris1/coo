import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { createJsonRoute } from "@/server/http";
import { recordTick } from "@/server/services/health";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { healthGet } from "./get";

const MINUTE = 60_000;

let deps: TestDeps;

beforeEach(async () => {
  deps = await makeTestDeps();
});

async function get() {
  const res = await healthGet(createJsonRoute(async () => deps))(
    new NextRequest("https://coo.test/api/health"),
  );
  return { status: res.status, json: await res.json() };
}

describe("GET /api/health", () => {
  it("answers without a session and reports a fresh tick", async () => {
    const at = deps.clock.now();
    await recordTick(deps);
    deps.clock.advance(MINUTE);

    const { status, json } = await get();

    expect(status).toBe(200);
    expect(json).toEqual({
      lastTickAt: at,
      ageMs: MINUTE,
      stale: false,
      serverNow: at + MINUTE,
    });
  });

  it("reports stale: true when the last tick is over 5 minutes old", async () => {
    await recordTick(deps);
    deps.clock.advance(5 * MINUTE + 1);

    const { status, json } = await get();

    expect(status).toBe(200);
    expect(json.stale).toBe(true);
  });

  it("reports stale: true before any tick has finished", async () => {
    const { json } = await get();

    expect(json).toMatchObject({ lastTickAt: null, stale: true });
  });
});
