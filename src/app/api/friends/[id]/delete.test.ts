import { beforeEach, describe, expect, it } from "vitest";
import type { UserId } from "@/server/ports/auth";
import { pair } from "@/server/rows";
import { joinByCode } from "@/server/services/friends";
import { onboard } from "@/server/services/onboarding";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { geoClient } from "@/test/geoRoute";
import { friendDelete } from "./delete";

const SETUP = {
  timezone: "America/New_York",
  bird: { name: "Gerald", look: "gerald", pronoun: "he" },
};

let deps: TestDeps;

beforeEach(async () => {
  deps = await makeTestDeps();
});

const clientFor = (id: string) =>
  geoClient(deps, friendDelete, `/api/friends/${id}`);

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

describe("DELETE /api/friends/[id]", () => {
  it("unfriends by removing the row and nudges both sides", async () => {
    const { priya, max } = await friends();
    const before = {
      priya: await eventCount(priya.id),
      max: await eventCount(max.id),
    };

    const { status, json } = await clientFor(max.id).del(priya.jar);

    expect(status).toBe(200);
    expect(json.error).toBeUndefined();
    expect(await row(priya.id, max.id)).toBeNull();
    expect(await eventCount(priya.id)).toBe(before.priya + 1);
    expect(await eventCount(max.id)).toBe(before.max + 1);
  });

  it("lets the pair join again by code after an unfriend", async () => {
    const { priya, max } = await friends();
    await clientFor(max.id).del(priya.jar);

    await joinByCode(deps, max.id as UserId, priya.code);

    expect(await row(priya.id, max.id)).toEqual({
      status: "accepted",
      blocked_by: null,
    });
  });

  it("answers a repeat with 404 not_found and changes nothing", async () => {
    const { priya, max } = await friends();
    await clientFor(max.id).del(priya.jar);

    const again = await clientFor(max.id).del(priya.jar);

    expect(again.status).toBe(404);
    expect(again.json.error.code).toBe("not_found");
    expect(await row(priya.id, max.id)).toBeNull();
  });

  it("refuses a request without a session as 401", async () => {
    const { priya, max } = await friends();
    const { status, json } = await clientFor(max.id).del();
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
    expect(await row(priya.id, max.id)).not.toBeNull();
  });

  it("answers someone who is not my friend with 404 not_found", async () => {
    const { priya, max } = await friends();
    const brenda = await onboarded("(555) 222-3333", "Brenda");

    const stranger = await clientFor(brenda.id).del(priya.jar);
    const outsider = await clientFor(max.id).del(brenda.jar);

    expect(stranger.status).toBe(404);
    expect(stranger.json.error.code).toBe("not_found");
    expect(outsider.status).toBe(404);
    expect(outsider.json.error.code).toBe("not_found");
    expect(await row(priya.id, max.id)).toEqual({
      status: "accepted",
      blocked_by: null,
    });
  });

  it("cannot lift a block: either side gets 404 and the row stays blocked", async () => {
    const { priya, max } = await friends();
    const [a, b] = pair(max.id as UserId, priya.id as UserId);
    await deps.db.query(
      "update friendships set status = 'blocked', blocked_by = $3 where a_id = $1 and b_id = $2",
      [a, b, priya.id],
    );

    const blocker = await clientFor(max.id).del(priya.jar);
    const blocked = await clientFor(priya.id).del(max.jar);

    expect(blocker.status).toBe(404);
    expect(blocker.json.error.code).toBe("not_found");
    expect(blocked.status).toBe(404);
    expect(blocked.json.error.code).toBe("not_found");
    expect(await row(priya.id, max.id)).toEqual({
      status: "blocked",
      blocked_by: priya.id,
    });
  });

  it.each(["not-a-uuid", "%20"])(
    "answers the id %j with 404 not_found",
    async (id) => {
      const { priya } = await friends();
      const { status, json } = await clientFor(id).del(priya.jar);
      expect(status).toBe(404);
      expect(json.error.code).toBe("not_found");
    },
  );
});
