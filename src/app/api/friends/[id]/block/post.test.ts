import { beforeEach, describe, expect, it } from "vitest";
import type { UserId } from "@/server/ports/auth";
import { pair } from "@/server/rows";
import { joinByCode } from "@/server/services/friends";
import { onboard } from "@/server/services/onboarding";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { geoClient } from "@/test/geoRoute";
import { friendsJoinPost } from "../../join/post";
import { friendBlockPost } from "./post";

const SETUP = {
  timezone: "America/New_York",
  bird: { name: "Gerald", look: "gerald", pronoun: "he" },
};

let deps: TestDeps;

beforeEach(async () => {
  deps = await makeTestDeps();
});

const clientFor = (id: string) =>
  geoClient(deps, friendBlockPost, `/api/friends/${id}/block`);

const joinClient = () => geoClient(deps, friendsJoinPost, "/api/friends/join");

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

async function row(x: string, y: string) {
  const [a, b] = pair(x as UserId, y as UserId);
  const rows = await deps.db.query<{ status: string; blocked_by: string }>(
    "select status, blocked_by from friendships where a_id = $1 and b_id = $2",
    [a, b],
  );
  return rows[0] ?? null;
}

async function eventCount(userId: string) {
  const [{ count }] = await deps.db.query<{ count: number }>(
    "select count(*)::int as count from events where user_id = $1",
    [userId],
  );
  return count;
}

describe("POST /api/friends/[id]/block", () => {
  it("blocks the pair as me and nudges both sides", async () => {
    const { priya, max } = await friends();
    const before = {
      priya: await eventCount(priya.id),
      max: await eventCount(max.id),
    };

    const { status, json } = await clientFor(max.id).post({}, priya.jar);

    expect(status).toBe(200);
    expect(json.error).toBeUndefined();
    expect(await row(priya.id, max.id)).toEqual({
      status: "blocked",
      blocked_by: priya.id,
    });
    expect(await eventCount(priya.id)).toBe(before.priya + 1);
    expect(await eventCount(max.id)).toBe(before.max + 1);
  });

  it("stops the pair joining again by either code", async () => {
    const { priya, max } = await friends();
    await clientFor(max.id).post({}, priya.jar);

    const maxJoins = await joinClient().post({ code: priya.code }, max.jar);
    const priyaJoins = await joinClient().post({ code: max.code }, priya.jar);

    expect(maxJoins.status).toBe(409);
    expect(maxJoins.json.error.code).toBe("conflict");
    expect(priyaJoins.status).toBe(409);
    expect(priyaJoins.json.error.code).toBe("conflict");
    expect(await row(priya.id, max.id)).toEqual({
      status: "blocked",
      blocked_by: priya.id,
    });
  });

  it("is safe to repeat", async () => {
    const { priya, max } = await friends();
    await clientFor(max.id).post({}, priya.jar);
    const events = await eventCount(max.id);

    const again = await clientFor(max.id).post({}, priya.jar);

    expect(again.status).toBe(200);
    expect(await row(priya.id, max.id)).toEqual({
      status: "blocked",
      blocked_by: priya.id,
    });
    expect(await eventCount(max.id)).toBe(events);
  });

  it("does not let the blocked side take the block over", async () => {
    const { priya, max } = await friends();
    await clientFor(max.id).post({}, priya.jar);

    const { status, json } = await clientFor(priya.id).post({}, max.jar);

    expect(status).toBe(404);
    expect(json.error.code).toBe("not_found");
    expect(await row(priya.id, max.id)).toEqual({
      status: "blocked",
      blocked_by: priya.id,
    });
  });

  it("refuses a request without a session as 401", async () => {
    const { priya, max } = await friends();
    const { status, json } = await clientFor(max.id).post({});
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
    expect(await row(priya.id, max.id)).toEqual({
      status: "accepted",
      blocked_by: null,
    });
  });

  it("answers someone who is not my friend with 404 not_found", async () => {
    const { priya, max } = await friends();
    const brenda = await onboarded("(555) 222-3333", "Brenda");

    const stranger = await clientFor(brenda.id).post({}, priya.jar);
    const outsider = await clientFor(max.id).post({}, brenda.jar);

    expect(stranger.status).toBe(404);
    expect(stranger.json.error.code).toBe("not_found");
    expect(outsider.status).toBe(404);
    expect(outsider.json.error.code).toBe("not_found");
    expect(await row(priya.id, brenda.id)).toBeNull();
    expect(await row(max.id, brenda.id)).toBeNull();
    expect(await row(priya.id, max.id)).toEqual({
      status: "accepted",
      blocked_by: null,
    });
  });

  it.each(["not-a-uuid", "%20"])(
    "answers the id %j with 404 not_found",
    async (id) => {
      const { priya } = await friends();
      const { status, json } = await clientFor(id).post({}, priya.jar);
      expect(status).toBe(404);
      expect(json.error.code).toBe("not_found");
    },
  );
});
