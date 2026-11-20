import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type { UserId } from "@/server/ports/auth";
import { pair } from "@/server/rows";
import { onboard } from "@/server/services/onboarding";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { geoClient } from "@/test/geoRoute";
import { reportsPost } from "./post";

const SETUP = {
  timezone: "America/New_York",
  bird: { name: "Gerald", look: "gerald", pronoun: "he" },
};
const PEPPER = "test-pepper";
const TOKEN = "k3Hq9ZtB2mXw7PaL";
const DAY_MS = 86_400_000;

let deps: TestDeps;
let client: ReturnType<typeof geoClient>;

beforeEach(async () => {
  deps = await makeTestDeps();
  client = geoClient(
    deps,
    (jsonRoute) => reportsPost(jsonRoute, () => PEPPER),
    "/api/reports",
  );
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

async function befriend(
  me: string,
  them: string,
  status: "accepted" | "blocked" = "accepted",
) {
  const [a, b] = pair(me as UserId, them as UserId);
  await deps.db.query(
    "insert into friendships (a_id, b_id, status, blocked_by) values ($1, $2, $3, $4)",
    [a, b, status, status === "blocked" ? me : null],
  );
}

async function guestLink(senderId: string, token: string) {
  const hash = createHash("sha256")
    .update(PEPPER + token)
    .digest("hex");
  const [{ id }] = await deps.db.query<{ id: string }>(
    `insert into guest_links (token_hash, sender_id, recipient_name, dest_lat, dest_lon, dest_label)
     values ($1, $2, 'Grandma', 40.7, -74.0, 'Brooklyn') returning id`,
    [hash, senderId],
  );
  return id;
}

async function reports() {
  return deps.db.query<{
    reporter_id: string;
    target_user_id: string | null;
    guest_link_id: string | null;
    reason: string;
    created_at: Date;
  }>(
    "select reporter_id, target_user_id, guest_link_id, reason, created_at from reports order by created_at, id",
  );
}

describe("POST /api/reports", () => {
  it("refuses a request without a session as 401", async () => {
    const priya = await onboarded("(555) 765-4321", "Priya");
    const { status, json } = await client.post({
      userId: priya.id,
      reason: "Spam",
    });
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
    expect(await reports()).toEqual([]);
  });

  it("files one report about an accepted friend", async () => {
    const priya = await onboarded("(555) 765-4321", "Priya");
    const max = await onboarded("(555) 123-4567", "Max");
    await befriend(max.id, priya.id);

    const { status, json } = await client.post(
      { userId: priya.id, reason: "She keeps sending spam" },
      max.jar,
    );

    expect(status).toBe(200);
    expect(json).toEqual({ serverNow: deps.clock.now() });
    expect(await reports()).toEqual([
      {
        reporter_id: max.id,
        target_user_id: priya.id,
        guest_link_id: null,
        reason: "She keeps sending spam",
        created_at: new Date(deps.clock.now()),
      },
    ]);
  });

  it("files a report about someone the caller has blocked", async () => {
    const priya = await onboarded("(555) 765-4321", "Priya");
    const max = await onboarded("(555) 123-4567", "Max");
    await befriend(max.id, priya.id, "blocked");

    const { status } = await client.post(
      { userId: priya.id, reason: "Threatening notes" },
      max.jar,
    );

    expect(status).toBe(200);
    expect(await reports()).toMatchObject([
      { reporter_id: max.id, target_user_id: priya.id },
    ]);
  });

  it("answers a stranger's id with 404 not_found and files nothing", async () => {
    const priya = await onboarded("(555) 765-4321", "Priya");
    const max = await onboarded("(555) 123-4567", "Max");

    const { status, json } = await client.post(
      { userId: priya.id, reason: "Spam" },
      max.jar,
    );

    expect(status).toBe(404);
    expect(json.error.code).toBe("not_found");
    expect(await reports()).toEqual([]);
  });

  it("answers reporting yourself with 404 not_found", async () => {
    const max = await onboarded("(555) 123-4567", "Max");

    const { status, json } = await client.post(
      { userId: max.id, reason: "Spam" },
      max.jar,
    );

    expect(status).toBe(404);
    expect(json.error.code).toBe("not_found");
    expect(await reports()).toEqual([]);
  });

  it("files a report about a guest link by its token and leaves the link active", async () => {
    const priya = await onboarded("(555) 765-4321", "Priya");
    const max = await onboarded("(555) 123-4567", "Max");
    const linkId = await guestLink(priya.id, TOKEN);

    const { status } = await client.post(
      { guestLinkToken: TOKEN, reason: "Unwanted note" },
      max.jar,
    );

    expect(status).toBe(200);
    expect(await reports()).toEqual([
      {
        reporter_id: max.id,
        target_user_id: null,
        guest_link_id: linkId,
        reason: "Unwanted note",
        created_at: new Date(deps.clock.now()),
      },
    ]);
    expect(
      await deps.db.query("select status from guest_links where id = $1", [
        linkId,
      ]),
    ).toEqual([{ status: "active" }]);
  });

  it("answers an unknown guest link token with 404 not_found", async () => {
    const priya = await onboarded("(555) 765-4321", "Priya");
    const max = await onboarded("(555) 123-4567", "Max");
    await guestLink(priya.id, TOKEN);

    const { status, json } = await client.post(
      { guestLinkToken: "AAAAAAAAAAAAAAAA", reason: "Unwanted note" },
      max.jar,
    );

    expect(status).toBe(404);
    expect(json.error.code).toBe("not_found");
    expect(await reports()).toEqual([]);
  });

  it.each([
    [
      "both targets",
      (id: string) => ({ userId: id, guestLinkToken: TOKEN, reason: "Spam" }),
    ],
    ["no target", () => ({ reason: "Spam" })],
    ["an empty reason", (id: string) => ({ userId: id, reason: "   " })],
    [
      "a 501-character reason",
      (id: string) => ({ userId: id, reason: "a".repeat(501) }),
    ],
    [
      "an unknown key",
      (id: string) => ({ userId: id, reason: "Spam", note: "x" }),
    ],
    [
      "a userId that is not a uuid",
      () => ({ userId: "priya", reason: "Spam" }),
    ],
  ])("answers %s with 400 invalid", async (_, body) => {
    const priya = await onboarded("(555) 765-4321", "Priya");
    const max = await onboarded("(555) 123-4567", "Max");
    await befriend(max.id, priya.id);
    await guestLink(priya.id, TOKEN);

    const { status, json } = await client.post(body(priya.id), max.jar);

    expect(status).toBe(400);
    expect(json.error.code).toBe("invalid");
    expect(await reports()).toEqual([]);
  });

  it("refuses the 11th report in a day as 429 and allows one the next day", async () => {
    const priya = await onboarded("(555) 765-4321", "Priya");
    const max = await onboarded("(555) 123-4567", "Max");
    await befriend(max.id, priya.id);
    const body = { userId: priya.id, reason: "Spam" };

    for (let i = 0; i < 10; i++) {
      expect((await client.post(body, max.jar)).status).toBe(200);
    }
    const eleventh = await client.post(body, max.jar);

    expect(eleventh.status).toBe(429);
    expect(eleventh.json.error.code).toBe("rate_limited");
    expect(await reports()).toHaveLength(10);

    deps.clock.advance(DAY_MS);
    expect((await client.post(body, max.jar)).status).toBe(200);
    expect(await reports()).toHaveLength(11);
  });

  it("counts wrong guest link tokens toward the daily limit", async () => {
    const priya = await onboarded("(555) 765-4321", "Priya");
    const max = await onboarded("(555) 123-4567", "Max");
    await guestLink(priya.id, TOKEN);

    for (let i = 0; i < 10; i++) {
      const guess = await client.post(
        { guestLinkToken: `guess${i}`, reason: "Spam" },
        max.jar,
      );
      expect(guess.status).toBe(404);
    }
    const real = await client.post(
      { guestLinkToken: TOKEN, reason: "Spam" },
      max.jar,
    );

    expect(real.status).toBe(429);
    expect(await reports()).toEqual([]);
  });
});
