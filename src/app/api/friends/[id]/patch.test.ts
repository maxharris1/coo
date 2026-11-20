import { beforeEach, describe, expect, it } from "vitest";
import type { UserId } from "@/server/ports/auth";
import { pair } from "@/server/rows";
import { joinByCode } from "@/server/services/friends";
import { onboard } from "@/server/services/onboarding";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { geoClient } from "@/test/geoRoute";
import { friendPatch } from "./patch";

const SETUP = {
  timezone: "America/New_York",
  bird: { name: "Gerald", look: "gerald", pronoun: "he" },
};

let deps: TestDeps;

beforeEach(async () => {
  deps = await makeTestDeps();
});

const clientFor = (id: string) =>
  geoClient(deps, friendPatch, `/api/friends/${id}`);

async function onboarded(number: string, name: string) {
  const session = await clientFor("x").signIn(number);
  const { me } = await onboard(deps, session.id as UserId, {
    ...SETUP,
    name,
  });
  await deps.db.query(
    "update profiles set onboarded_at = to_timestamp($2 / 1000.0) where id = $1",
    [session.id, deps.clock.now()],
  );
  return { ...session, code: me.inviteCode };
}

async function friends() {
  const priya = await onboarded("(555) 765-4321", "Priya");
  const max = await onboarded("(555) 123-4567", "Max");
  await joinByCode(deps, max.id as UserId, priya.code);
  return { priya, max };
}

async function shows(me: string, them: string) {
  const [a, b] = pair(me as UserId, them as UserId);
  const [row] = await deps.db.query<{ a_shows: string; b_shows: string }>(
    "select a_shows, b_shows from friendships where a_id = $1 and b_id = $2",
    [a, b],
  );
  return me === a
    ? { mine: row.a_shows, theirs: row.b_shows }
    : { mine: row.b_shows, theirs: row.a_shows };
}

async function eventCount(userId: string) {
  const [{ count }] = await deps.db.query<{ count: number }>(
    "select count(*)::int as count from events where user_id = $1",
    [userId],
  );
  return count;
}

describe("PATCH /api/friends/[id]", () => {
  it("sets only what I let them see and answers with the friend", async () => {
    const { priya, max } = await friends();
    const before = await eventCount(max.id);

    const { status, json } = await clientFor(max.id).patch(
      { shows: "city" },
      priya.jar,
    );

    expect(status).toBe(200);
    expect(json.friend).toEqual({
      id: max.id,
      name: "Max",
      handle: "max",
      shows: "city",
      theyShow: "block",
    });
    expect(await shows(priya.id, max.id)).toEqual({
      mine: "city",
      theirs: "block",
    });
    expect(await eventCount(max.id)).toBe(before + 1);
  });

  it("is safe to repeat and can go back to block", async () => {
    const { priya, max } = await friends();
    const client = clientFor(max.id);

    await client.patch({ shows: "city" }, priya.jar);
    const again = await client.patch({ shows: "city" }, priya.jar);
    expect(again.status).toBe(200);
    expect(again.json.friend.shows).toBe("city");

    const back = await client.patch({ shows: "block" }, priya.jar);
    expect(back.json.friend.shows).toBe("block");
    expect(await shows(priya.id, max.id)).toEqual({
      mine: "block",
      theirs: "block",
    });
  });

  it("refuses a request without a session as 401", async () => {
    const { priya, max } = await friends();
    const { status, json } = await clientFor(max.id).patch({ shows: "city" });
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
    expect(await shows(priya.id, max.id)).toEqual({
      mine: "block",
      theirs: "block",
    });
  });

  it("answers someone who is not my friend with 404 not_found", async () => {
    const { priya, max } = await friends();
    const brenda = await onboarded("(555) 222-3333", "Brenda");

    const stranger = await clientFor(brenda.id).patch(
      { shows: "city" },
      priya.jar,
    );
    const outsider = await clientFor(max.id).patch(
      { shows: "city" },
      brenda.jar,
    );

    expect(stranger.status).toBe(404);
    expect(stranger.json.error.code).toBe("not_found");
    expect(outsider.status).toBe(404);
    expect(outsider.json.error.code).toBe("not_found");
    expect(await shows(priya.id, max.id)).toEqual({
      mine: "block",
      theirs: "block",
    });
  });

  it("answers a blocked pair with 404 not_found and leaves the row alone", async () => {
    const { priya, max } = await friends();
    const [a, b] = pair(max.id as UserId, priya.id as UserId);
    await deps.db.query(
      "update friendships set status = 'blocked', blocked_by = $3 where a_id = $1 and b_id = $2",
      [a, b, priya.id],
    );

    const { status, json } = await clientFor(max.id).patch(
      { shows: "city" },
      priya.jar,
    );

    expect(status).toBe(404);
    expect(json.error.code).toBe("not_found");
    expect(await shows(priya.id, max.id)).toEqual({
      mine: "block",
      theirs: "block",
    });
  });

  it("answers my own id with 404 not_found", async () => {
    const { priya } = await friends();
    const { status, json } = await clientFor(priya.id).patch(
      { shows: "city" },
      priya.jar,
    );
    expect(status).toBe(404);
    expect(json.error.code).toBe("not_found");
  });

  it.each(["not-a-uuid", "", "%20"])(
    "answers the id %j with 404 not_found",
    async (id) => {
      const { priya } = await friends();
      const { status, json } = await clientFor(id).patch(
        { shows: "city" },
        priya.jar,
      );
      expect(status).toBe(404);
      expect(json.error.code).toBe("not_found");
    },
  );

  it.each([
    ["an empty body", {}],
    ["an unknown value", { shows: "roost" }],
    ["an unknown key", { shows: "city", theyShow: "city" }],
  ])("answers %s with 400 invalid", async (_, body) => {
    const { priya, max } = await friends();
    const { status, json } = await clientFor(max.id).patch(body, priya.jar);
    expect(status).toBe(400);
    expect(json.error.code).toBe("invalid");
  });
});
