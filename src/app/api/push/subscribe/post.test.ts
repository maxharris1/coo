import { beforeEach, describe, expect, it } from "vitest";
import type { UserId } from "@/server/ports/auth";
import { onboard } from "@/server/services/onboarding";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { geoClient } from "@/test/geoRoute";
import { pushSubscribePost } from "./post";

const SETUP = {
  timezone: "America/New_York",
  bird: { name: "Gerald", look: "gerald", pronoun: "he" },
};

const ENDPOINT = "https://web.push.apple.com/QGuQyavXutnMH-endpoint-1";

const subscription = (keys = { p256dh: "BPkey-one", auth: "auth-one" }) => ({
  endpoint: ENDPOINT,
  expirationTime: null,
  keys,
});

let deps: TestDeps;
let client: ReturnType<typeof geoClient>;

beforeEach(async () => {
  deps = await makeTestDeps();
  client = geoClient(deps, pushSubscribePost, "/api/push/subscribe");
});

async function onboarded(number: string, name: string) {
  const session = await client.signIn(number);
  await onboard(deps, session.id as UserId, { ...SETUP, name });
  await deps.db.query(
    "update profiles set onboarded_at = to_timestamp($2 / 1000.0) where id = $1",
    [session.id, deps.clock.now()],
  );
  return session;
}

async function rows() {
  return deps.db.query<{
    id: string;
    user_id: string;
    endpoint: string;
    p256dh: string;
    auth: string;
  }>(
    "select id, user_id, endpoint, p256dh, auth from push_subscriptions order by created_at",
  );
}

describe("POST /api/push/subscribe", () => {
  it("refuses a request without a session as 401 and stores nothing", async () => {
    const { status, json } = await client.post(subscription());
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
    expect(await rows()).toEqual([]);
  });

  it("stores the browser's subscription for me", async () => {
    const max = await onboarded("(555) 123-4567", "Max");

    const { status, json } = await client.post(subscription(), max.jar);

    expect(status).toBe(200);
    expect(json.error).toBeUndefined();
    expect(await rows()).toEqual([
      {
        id: expect.any(String),
        user_id: max.id,
        endpoint: ENDPOINT,
        p256dh: "BPkey-one",
        auth: "auth-one",
      },
    ]);
  });

  it("leaves one unchanged row when repeated", async () => {
    const max = await onboarded("(555) 123-4567", "Max");
    await client.post(subscription(), max.jar);
    const before = await rows();

    const again = await client.post(subscription(), max.jar);

    expect(again.status).toBe(200);
    expect(await rows()).toEqual(before);
  });

  it("updates the keys in place when the same endpoint comes back with new ones", async () => {
    const max = await onboarded("(555) 123-4567", "Max");
    await client.post(subscription(), max.jar);
    const [first] = await rows();

    await client.post(
      subscription({ p256dh: "BPkey-two", auth: "auth-two" }),
      max.jar,
    );

    expect(await rows()).toEqual([
      { ...first, p256dh: "BPkey-two", auth: "auth-two" },
    ]);
  });

  it("moves a device's endpoint to whoever signed in on it last", async () => {
    const priya = await onboarded("(555) 765-4321", "Priya");
    const max = await onboarded("(555) 123-4567", "Max");
    await client.post(subscription(), priya.jar);

    await client.post(subscription(), max.jar);

    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0].user_id).toBe(max.id);
  });

  it.each([
    ["an empty body", {}],
    ["a missing endpoint", { keys: { p256dh: "k", auth: "a" } }],
    [
      "an endpoint that is not https",
      { ...subscription(), endpoint: "http://x.test/e" },
    ],
    ["missing keys", { endpoint: ENDPOINT }],
    [
      "an empty auth key",
      { ...subscription(), keys: { p256dh: "k", auth: "" } },
    ],
  ])("answers %s with 400 invalid and stores nothing", async (_, body) => {
    const max = await onboarded("(555) 123-4567", "Max");
    const { status, json } = await client.post(body, max.jar);
    expect(status).toBe(400);
    expect(json.error.code).toBe("invalid");
    expect(await rows()).toEqual([]);
  });
});
