import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserId } from "@/server/ports/auth";
import { pair } from "@/server/rows";
import { onboard } from "@/server/services/onboarding";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { seedWorld, type World } from "@/test/seedWorld";
import { asRole } from "@/test/testDb";
import type { GuestSendResult } from "./flights/guestSend";
import { send } from "./flights/send";
import { friendshipBetween, joinByCode, listFriends } from "./friends";
import { listNotes } from "./notes";
import { searchPlaces } from "./places";
import { tick } from "./tick";

vi.mock("@/env", () => ({
  getEnv: () => ({ LINK_TOKEN_PEPPER: "test-pepper" }),
}));

const SETUP = {
  timezone: "America/New_York",
  bird: { name: "Gerald", look: "gerald", pronoun: "he" },
};

const ids = {
  max: "00000000-0000-4000-a000-000000000001" as UserId,
  priya: "00000000-0000-4000-a000-000000000002" as UserId,
  brenda: "00000000-0000-4000-a000-000000000003" as UserId,
};

let deps: TestDeps;

beforeEach(async () => {
  deps = await makeTestDeps();
  await deps.db.query("insert into auth.users (id) select unnest($1::uuid[])", [
    Object.values(ids),
  ]);
});

async function profile(id: UserId, name: string) {
  const { me } = await onboard(deps, id, { ...SETUP, name });
  return me.inviteCode;
}

describe("friendshipBetween", () => {
  it("is null for two people with no row", async () => {
    await profile(ids.max, "Max");
    await profile(ids.priya, "Priya");
    expect(await friendshipBetween(deps.db, ids.max, ids.priya)).toBeNull();
  });

  it("reads the pair from either side with my shows and theirs", async () => {
    const code = await profile(ids.priya, "Priya");
    await profile(ids.max, "Max");
    await joinByCode(deps, ids.max, code);
    await deps.db.query(
      "update friendships set a_shows = 'city' where a_id = $1",
      [ids.max],
    );

    expect(await friendshipBetween(deps.db, ids.max, ids.priya)).toEqual({
      status: "accepted",
      blockedBy: null,
      myShows: "city",
      theirShows: "block",
    });
    expect(await friendshipBetween(deps.db, ids.priya, ids.max)).toEqual({
      status: "accepted",
      blockedBy: null,
      myShows: "block",
      theirShows: "city",
    });
  });

  it("never reads a pair the caller is not part of", async () => {
    const code = await profile(ids.priya, "Priya");
    await profile(ids.max, "Max");
    await profile(ids.brenda, "Brenda");
    await joinByCode(deps, ids.max, code);
    expect(await friendshipBetween(deps.db, ids.brenda, ids.priya)).toBeNull();
    expect(await friendshipBetween(deps.db, ids.brenda, ids.max)).toBeNull();
  });
});

describe("joinByCode", () => {
  it("records the join at the clock's time", async () => {
    const code = await profile(ids.priya, "Priya");
    await profile(ids.max, "Max");
    await joinByCode(deps, ids.max, code);
    const [row] = await deps.db.query<{ created_at: Date }>(
      "select created_at from friendships",
    );
    expect(row.created_at.getTime()).toBe(deps.clock.now());
  });

  it("does not notify again when a pair that unfriended joins again", async () => {
    const code = await profile(ids.priya, "Priya");
    await profile(ids.max, "Max");
    await joinByCode(deps, ids.max, code);
    await deps.db.query("delete from friendships");
    await joinByCode(deps, ids.max, code);
    const rows = await deps.db.query(
      "select 1 from notifications where user_id = $1",
      [ids.priya],
    );
    expect(rows).toHaveLength(1);
  });
});

describe("joinByCode resolves leftover guest sends", () => {
  let world: World;
  let max: UserId;
  let rosa: UserId;

  beforeEach(async () => {
    world = await seedWorld(deps.db, deps.clock.now());
    max = world.max.id as UserId;
    rosa = world.rosa.id as UserId;
    await deps.db.query(
      "delete from friendships where a_id = $1 and b_id = $2",
      pair(max, rosa),
    );
  });

  async function guestSendTo(sender: UserId, birdId: string, to: UserId) {
    const { results } = await searchPlaces(deps, sender, "Williamsburg");
    const result = (await send(deps, sender, {
      body: "Come see the new loft",
      sends: [{ guest: { name: "Pal", placeId: results[0].placeId }, birdId }],
    })) as GuestSendResult;
    const [{ id: linkId }] = await deps.db.query<{ id: string }>(
      `update guest_links set notify_phone = (select phone from auth.users where id = $2)
       where id = (select guest_link_id from flights where id = $1) returning id`,
      [result.flights[0].id, to],
    );
    return { linkId, arriveAt: result.flights[0].arriveAt as number };
  }

  async function attribution(linkId: string) {
    const [row] = await deps.db.query<Record<string, unknown>>(
      `select g.status, g.claimed_by, f.counterpart_id, n.recipient_id,
              f.to_lat, f.to_lon, f.to_label, f.arrive_at
         from guest_links g
         join flights f on f.guest_link_id = g.id and f.kind = 'delivery'
         join notes n on n.id = f.note_id
        where g.id = $1`,
      [linkId],
    );
    return row;
  }

  const claimedBy = (who: UserId) => ({
    status: "claimed",
    claimed_by: who,
    counterpart_id: who,
    recipient_id: who,
  });

  async function friendshipRows() {
    return deps.db.query(
      "select status, via from friendships where a_id = $1 and b_id = $2",
      pair(max, rosa),
    );
  }

  it("claims a mid-flight send to the joiner's phone and keeps its destination (ac-2)", async () => {
    const { linkId, arriveAt } = await guestSendTo(
      max,
      world.max.birds[0].id,
      rosa,
    );
    const before = await attribution(linkId);

    await joinByCode(deps, rosa, "seed-max");

    expect(await attribution(linkId)).toEqual({
      ...before,
      ...claimedBy(rosa),
    });
    expect(await friendshipRows()).toEqual([
      { status: "accepted", via: "invite" },
    ]);
    const { friends, guestLinks } = await listFriends(deps, max);
    expect(friends.map((f) => f.id)).toContain(rosa);
    expect(guestLinks).toEqual([]);

    const shoebox = async () =>
      (await listNotes(deps, rosa, { friendId: max })).notes;
    expect(await shoebox()).toEqual([]);
    deps.clock.set(arriveAt + 60_000);
    await tick(deps);
    expect(await shoebox()).toEqual([
      expect.objectContaining({
        direction: "received",
        state: "delivered",
        body: "Come see the new loft",
      }),
    ]);
  });

  it("claims the leftover link without an error when they are already friends (ac-2)", async () => {
    const { linkId } = await guestSendTo(max, world.max.birds[0].id, rosa);
    await joinByCode(deps, rosa, "seed-max");
    await deps.db.query(
      "update guest_links set status = 'active', claimed_by = null, claimed_at = null where id = $1",
      [linkId],
    );
    const before = await attribution(linkId);

    await expect(joinByCode(deps, rosa, "seed-max")).resolves.toEqual({
      friend: expect.objectContaining({ id: max }),
    });
    expect(await attribution(linkId)).toEqual({
      ...before,
      ...claimedBy(rosa),
    });
    expect(await friendshipRows()).toHaveLength(1);
  });

  it("resolves crossed sends from both sides (ac-2)", async () => {
    const toRosa = await guestSendTo(max, world.max.birds[0].id, rosa);
    const toMax = await guestSendTo(rosa, world.rosa.birds[0].id, max);
    const before = {
      toRosa: await attribution(toRosa.linkId),
      toMax: await attribution(toMax.linkId),
    };

    await joinByCode(deps, max, "seed-rosa");

    expect(await attribution(toRosa.linkId)).toEqual({
      ...before.toRosa,
      ...claimedBy(rosa),
    });
    expect(await attribution(toMax.linkId)).toEqual({
      ...before.toMax,
      ...claimedBy(max),
    });
    expect(await friendshipRows()).toHaveLength(1);
    expect((await listFriends(deps, max)).guestLinks).toEqual([]);
    expect((await listFriends(deps, rosa)).guestLinks).toEqual([]);
  });

  it("claims the send as the coo_app server role (ac-2)", async () => {
    const { linkId } = await guestSendTo(max, world.max.birds[0].id, rosa);

    await joinByCode(
      { ...deps, db: asRole(deps.db, "coo_app") },
      rosa,
      "seed-max",
    );

    expect(await attribution(linkId)).toMatchObject(claimedBy(rosa));
  });

  it("does not hand a blocked friend's landed note to another friend with the same name", async () => {
    const priya = world.priya.id as UserId;
    const { linkId, arriveAt } = await guestSendTo(
      max,
      world.max.birds[0].id,
      rosa,
    );
    await deps.db.query("update profiles set name = 'Rosa' where id = $1", [
      priya,
    ]);
    await deps.db.query(
      "update guest_links set recipient_name = 'Rosa' where id = $1",
      [linkId],
    );
    const [a, b] = pair(max, rosa);
    await deps.db.query(
      "insert into friendships (a_id, b_id, status, blocked_by) values ($1, $2, 'blocked', $3)",
      [a, b, max],
    );
    deps.clock.set(arriveAt + 60_000);
    await tick(deps);
    const shoebox = async () => (await listNotes(deps, priya, {})).notes;
    expect(await shoebox()).toEqual([]);

    await joinByCode(deps, priya, "seed-max");

    expect(await shoebox()).toEqual([]);
    expect(await attribution(linkId)).toMatchObject({
      status: "active",
      claimed_by: null,
      recipient_id: null,
    });
  });

  it("refuses a blocked pair with conflict and writes nothing to the link (ac-3)", async () => {
    const { linkId } = await guestSendTo(max, world.max.birds[0].id, rosa);
    const [a, b] = pair(max, rosa);
    await deps.db.query(
      "insert into friendships (a_id, b_id, status, blocked_by) values ($1, $2, 'blocked', $3)",
      [a, b, max],
    );
    const snapshot = () =>
      Promise.all(
        [
          "select * from guest_links order by id",
          "select * from flights order by id",
          "select * from notes order by id",
          "select * from friendships order by a_id, b_id",
        ].map((sql) => deps.db.query(sql)),
      );
    const before = await snapshot();

    await expect(joinByCode(deps, rosa, "seed-max")).rejects.toMatchObject({
      code: "conflict",
    });
    expect(await snapshot()).toEqual(before);
    expect(await attribution(linkId)).toMatchObject({
      status: "active",
      claimed_by: null,
      counterpart_id: null,
    });
  });
});
