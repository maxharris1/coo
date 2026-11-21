import { beforeEach, describe, expect, it } from "vitest";
import type { UserId } from "@/server/ports/auth";
import { onboard } from "@/server/services/onboarding";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { geoClient } from "@/test/geoRoute";
import { pushSubscribePost } from "../subscribe/post";
import { pushUnsubscribePost } from "./post";

const SETUP = {
  timezone: "America/New_York",
  bird: { name: "Gerald", look: "gerald", pronoun: "he" },
};

const MAX_ENDPOINT = "https://web.push.apple.com/max-endpoint";
const PRIYA_ENDPOINT = "https://web.push.apple.com/priya-endpoint";

let deps: TestDeps;
let client: ReturnType<typeof geoClient>;

beforeEach(async () => {
  deps = await makeTestDeps();
  client = geoClient(deps, pushUnsubscribePost, "/api/push/unsubscribe");
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

async function subscribed(
  session: Awaited<ReturnType<typeof onboarded>>,
  endpoint: string,
) {
  const subscribe = geoClient(deps, pushSubscribePost, "/api/push/subscribe");
  const { status } = await subscribe.post(
    { endpoint, expirationTime: null, keys: { p256dh: "k", auth: "a" } },
    session.jar,
  );
  expect(status).toBe(200);
}

async function endpoints() {
  const all = await deps.db.query<{ user_id: string; endpoint: string }>(
    "select user_id, endpoint from push_subscriptions order by endpoint",
  );
  return all;
}

async function both() {
  const priya = await onboarded("(555) 765-4321", "Priya");
  const max = await onboarded("(555) 123-4567", "Max");
  await subscribed(priya, PRIYA_ENDPOINT);
  await subscribed(max, MAX_ENDPOINT);
  return { priya, max };
}

describe("POST /api/push/unsubscribe", () => {
  it("refuses a request without a session as 401 and deletes nothing", async () => {
    const { priya, max } = await both();
    const { status, json } = await client.post({ endpoint: MAX_ENDPOINT });
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
    expect(await endpoints()).toEqual([
      { user_id: max.id, endpoint: MAX_ENDPOINT },
      { user_id: priya.id, endpoint: PRIYA_ENDPOINT },
    ]);
  });

  it("deletes my matching endpoint and nothing else", async () => {
    const { priya, max } = await both();

    const { status, json } = await client.post(
      { endpoint: MAX_ENDPOINT },
      max.jar,
    );

    expect(status).toBe(200);
    expect(json.error).toBeUndefined();
    expect(await endpoints()).toEqual([
      { user_id: priya.id, endpoint: PRIYA_ENDPOINT },
    ]);
  });

  it("refuses someone else's endpoint as 404 not_found and leaves it in place", async () => {
    const { priya, max } = await both();

    const { status, json } = await client.post(
      { endpoint: PRIYA_ENDPOINT },
      max.jar,
    );

    expect(status).toBe(404);
    expect(json.error.code).toBe("not_found");
    expect(await endpoints()).toEqual([
      { user_id: max.id, endpoint: MAX_ENDPOINT },
      { user_id: priya.id, endpoint: PRIYA_ENDPOINT },
    ]);
  });

  it("answers an endpoint that is already gone the same way as someone else's", async () => {
    const { priya, max } = await both();
    await client.post({ endpoint: MAX_ENDPOINT }, max.jar);

    const again = await client.post({ endpoint: MAX_ENDPOINT }, max.jar);

    expect(again.status).toBe(404);
    expect(again.json.error.code).toBe("not_found");
    expect(await endpoints()).toEqual([
      { user_id: priya.id, endpoint: PRIYA_ENDPOINT },
    ]);
  });

  it.each([
    ["an empty body", {}],
    ["an empty endpoint", { endpoint: "" }],
    ["an unknown key", { endpoint: MAX_ENDPOINT, userId: "x" }],
  ])("answers %s with 400 invalid and deletes nothing", async (_, body) => {
    const { max } = await both();
    const { status, json } = await client.post(body, max.jar);
    expect(status).toBe(400);
    expect(json.error.code).toBe("invalid");
    expect(await endpoints()).toHaveLength(2);
  });
});
