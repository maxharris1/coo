import { beforeEach, describe, expect, it } from "vitest";
import type { UserId } from "@/server/ports/auth";
import { pair } from "@/server/rows";
import { friendshipBetween } from "@/server/services/friends";
import { onboard } from "@/server/services/onboarding";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { geoClient } from "@/test/geoRoute";
import { friendsJoinPost } from "./post";

const SETUP = {
  timezone: "America/New_York",
  bird: { name: "Gerald", look: "gerald", pronoun: "he" },
};

let deps: TestDeps;
let client: ReturnType<typeof geoClient>;

beforeEach(async () => {
  deps = await makeTestDeps();
  client = geoClient(deps, friendsJoinPost, "/api/friends/join");
});

async function onboarded(number: string, name: string) {
  const session = await client.signIn(number);
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

async function friendships() {
  return deps.db.query<{
    a_id: string;
    b_id: string;
    status: string;
    a_shows: string;
    b_shows: string;
    via: string;
  }>("select a_id, b_id, status, a_shows, b_shows, via from friendships");
}

async function notifications(userId: string) {
  return deps.db.query<{ kind: string; title: string; ref_id: string }>(
    "select kind, title, ref_id from notifications where user_id = $1",
    [userId],
  );
}

async function events(userId: string) {
  const [{ count }] = await deps.db.query<{ count: number }>(
    "select count(*)::int as count from events where user_id = $1",
    [userId],
  );
  return count;
}

async function befriendStrangers(userId: string, count: number) {
  await deps.db.query(
    `with users as (
       insert into auth.users select from generate_series(1, $2) returning id
     ), people as (
       insert into profiles (id, name, handle, invite_code)
       select id, 'Stranger', 's' || left(md5(id::text), 19), 'code-' || id from users
       returning id
     )
     insert into friendships (a_id, b_id)
     select least($1::uuid, id), greatest($1::uuid, id) from people`,
    [userId, count],
  );
}

describe("POST /api/friends/join", () => {
  it("refuses a request without a session as 401", async () => {
    const priya = await onboarded("(555) 765-4321", "Priya");
    const { status, json } = await client.post({ code: priya.code });
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
    expect(await friendships()).toEqual([]);
  });

  it("makes one accepted row with both sides block and notifies the inviter once", async () => {
    const priya = await onboarded("(555) 765-4321", "Priya");
    const max = await onboarded("(555) 123-4567", "Max");

    const { status, json } = await client.post({ code: priya.code }, max.jar);

    expect(status).toBe(200);
    expect(json.friend).toEqual({
      id: priya.id,
      name: "Priya",
      handle: "priya",
    });
    const [a, b] = pair(max.id, priya.id);
    expect(await friendships()).toEqual([
      {
        a_id: a,
        b_id: b,
        status: "accepted",
        a_shows: "block",
        b_shows: "block",
        via: "invite",
      },
    ]);
    expect(await notifications(priya.id)).toEqual([
      { kind: "friend-joined", title: "Max made a loft", ref_id: max.id },
    ]);
    expect(await notifications(max.id)).toEqual([]);
    expect(await events(priya.id)).toBe(1);
    expect(await events(max.id)).toBe(1);
  });

  it("is safe to repeat: a second join answers the same and adds nothing", async () => {
    const priya = await onboarded("(555) 765-4321", "Priya");
    const max = await onboarded("(555) 123-4567", "Max");

    const first = await client.post({ code: priya.code }, max.jar);
    const again = await client.post({ code: priya.code }, max.jar);
    const back = await client.post({ code: max.code }, priya.jar);

    expect(again.status).toBe(200);
    expect(again.json).toEqual(first.json);
    expect(back.status).toBe(200);
    expect(back.json.friend.id).toBe(max.id);
    expect(await friendships()).toHaveLength(1);
    expect(await notifications(priya.id)).toHaveLength(1);
    expect(await notifications(max.id)).toEqual([]);
    expect(await events(priya.id)).toBe(1);
    expect(await events(max.id)).toBe(1);
  });

  it("refuses joining with your own code as 400 invalid", async () => {
    const max = await onboarded("(555) 123-4567", "Max");
    const { status, json } = await client.post({ code: max.code }, max.jar);
    expect(status).toBe(400);
    expect(json.error.code).toBe("invalid");
    expect(await friendships()).toEqual([]);
  });

  it("answers an unknown code with 404 not_found", async () => {
    const max = await onboarded("(555) 123-4567", "Max");
    const { status, json } = await client.post(
      { code: "nobody-AAAAAAAAAAAA" },
      max.jar,
    );
    expect(status).toBe(404);
    expect(json.error.code).toBe("not_found");
    expect(await friendships()).toEqual([]);
  });

  it.each([
    ["an empty body", {}],
    ["an empty code", { code: "" }],
    ["a code that is not text", { code: 7 }],
    ["an unknown key", { code: "x", userId: "y" }],
  ])("answers %s with 400 invalid", async (_, body) => {
    const max = await onboarded("(555) 123-4567", "Max");
    const { status, json } = await client.post(body, max.jar);
    expect(status).toBe(400);
    expect(json.error.code).toBe("invalid");
  });

  it("refuses a blocked pair as 409 conflict and leaves the block in place", async () => {
    const priya = await onboarded("(555) 765-4321", "Priya");
    const max = await onboarded("(555) 123-4567", "Max");
    const [a, b] = pair(max.id, priya.id);
    await deps.db.query(
      "insert into friendships (a_id, b_id, status, blocked_by) values ($1, $2, 'blocked', $3)",
      [a, b, priya.id],
    );

    const joined = await client.post({ code: priya.code }, max.jar);
    const blocker = await client.post({ code: max.code }, priya.jar);

    expect(joined.status).toBe(409);
    expect(joined.json.error.code).toBe("conflict");
    expect(blocker.status).toBe(409);
    expect(await friendships()).toMatchObject([{ status: "blocked" }]);
    expect(await notifications(priya.id)).toEqual([]);
  });

  it("only ever befriends the caller, never someone named in the body", async () => {
    const priya = await onboarded("(555) 765-4321", "Priya");
    const brenda = await onboarded("(555) 222-3333", "Brenda");
    const max = await onboarded("(555) 123-4567", "Max");

    const named = await client.post(
      { code: priya.code, userId: brenda.id },
      max.jar,
    );
    expect(named.status).toBe(400);
    await client.post({ code: priya.code }, max.jar);

    const rows = await friendships();
    expect(rows).toHaveLength(1);
    expect([rows[0].a_id, rows[0].b_id].sort()).toEqual(
      [max.id, priya.id].sort(),
    );
  });

  it("lets the 150th friend in and refuses the 151st as 429 rate_limited", async () => {
    const priya = await onboarded("(555) 765-4321", "Priya");
    const brenda = await onboarded("(555) 222-3333", "Brenda");
    const max = await onboarded("(555) 123-4567", "Max");
    await befriendStrangers(max.id, 149);

    const last = await client.post({ code: priya.code }, max.jar);
    const over = await client.post({ code: brenda.code }, max.jar);
    const back = await client.post({ code: max.code }, brenda.jar);

    expect(last.status).toBe(200);
    expect(over.status).toBe(429);
    expect(over.json.error.code).toBe("rate_limited");
    expect(back.status).toBe(429);
    expect(
      await friendshipBetween(deps.db, max.id as UserId, brenda.id as UserId),
    ).toBeNull();
    expect(await notifications(brenda.id)).toEqual([]);
    expect(await events(brenda.id)).toBe(0);
  });

  it("still answers a repeat join from an existing friend at the cap", async () => {
    const priya = await onboarded("(555) 765-4321", "Priya");
    const max = await onboarded("(555) 123-4567", "Max");
    await befriendStrangers(max.id, 149);
    await client.post({ code: priya.code }, max.jar);

    const again = await client.post({ code: priya.code }, max.jar);

    expect(again.status).toBe(200);
    expect(again.json.friend.id).toBe(priya.id);
  });

  it("does not count blocked rows toward the cap", async () => {
    const priya = await onboarded("(555) 765-4321", "Priya");
    const max = await onboarded("(555) 123-4567", "Max");
    await befriendStrangers(max.id, 150);
    await deps.db.query(
      "update friendships set status = 'blocked', blocked_by = $1 where ctid in (select ctid from friendships limit 1)",
      [max.id],
    );

    const joined = await client.post({ code: priya.code }, max.jar);

    expect(joined.status).toBe(200);
  });
});
