import { beforeEach, describe, expect, it } from "vitest";
import type { UserId } from "@/server/ports/auth";
import { onboard } from "@/server/services/onboarding";
import { TEST_SESSION_COOKIE } from "@/server/testAuth";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import type { FakeJar } from "@/test/fakes/jar";
import { geoClient } from "@/test/geoRoute";
import { realtimeTokenGet } from "./get";

const SETUP = {
  timezone: "America/New_York",
  bird: { name: "Gerald", look: "gerald", pronoun: "he" },
};

let deps: TestDeps;
let client: ReturnType<typeof geoClient>;

beforeEach(async () => {
  deps = await makeTestDeps();
  client = geoClient(deps, realtimeTokenGet, "/api/realtime/token");
});

async function withProfile(number: string, name: string) {
  const session = await client.signIn(number);
  await onboard(deps, session.id as UserId, { ...SETUP, name });
  return session;
}

async function onboarded(number: string, name: string) {
  const session = await withProfile(number, name);
  await deps.db.query(
    "update profiles set onboarded_at = to_timestamp($2 / 1000.0) where id = $1",
    [session.id, deps.clock.now()],
  );
  return session;
}

function sessionCookie(jar: FakeJar) {
  return jar.cookies.get(TEST_SESSION_COOKIE)?.value;
}

describe("GET /api/realtime/token", () => {
  it("refuses a request without a session as 401", async () => {
    const { status, json } = await client.get({});
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
    expect(json.token).toBeUndefined();
  });

  it("refuses a user who has not finished onboarding as 409 not_onboarded", async () => {
    const { jar } = await withProfile("(555) 123-4567", "Max");
    const { status, json } = await client.get({}, jar);
    expect(status).toBe(409);
    expect(json.error.code).toBe("not_onboarded");
    expect(json.token).toBeUndefined();
  });

  it("gives each onboarded caller their own token and never someone else's", async () => {
    const max = await onboarded("(555) 123-4567", "Max");
    const brenda = await onboarded("(555) 765-4321", "Brenda");

    const forMax = await client.get({}, max.jar);
    const forBrenda = await client.get({}, brenda.jar);

    expect(forMax.status).toBe(200);
    expect(forBrenda.status).toBe(200);
    expect(sessionCookie(max.jar)).toBeTruthy();
    expect(forMax.json.token).toBe(sessionCookie(max.jar));
    expect(forBrenda.json.token).toBe(sessionCookie(brenda.jar));
    expect(forBrenda.json.token).not.toBe(forMax.json.token);
  });
});
