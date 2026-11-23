import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserId } from "@/server/ports/auth";
import { pair } from "@/server/rows";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { seedWorld, type World } from "@/test/seedWorld";
import type { GuestSendResult } from "../flights/guestSend";
import { send } from "../flights/send";
import { searchPlaces } from "../places";
import { tick } from "../tick";
import { claimGuestLink } from "./claim";
import { linksToMyPhone, resolveLinksBetween } from "./resolve";

vi.mock("@/env", () => ({
  getEnv: () => ({ LINK_TOKEN_PEPPER: PEPPER }),
}));

const PEPPER = "test-pepper";
const MINUTE = 60_000;
const IP = "203.0.113.7";

let deps: TestDeps;
let world: World;
let max: UserId;
let rosa: UserId;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
  max = world.max.id as UserId;
  rosa = world.rosa.id as UserId;
  await deps.db.query("delete from friendships where a_id = $1 and b_id = $2", [
    ...pair(max, rosa),
  ]);
});

async function guestSend(sender: UserId, birdId: string, name: string) {
  const { results } = await searchPlaces(deps, sender, "Williamsburg");
  const result = (await send(deps, sender, {
    body: "Come see the new loft",
    sends: [{ guest: { name, placeId: results[0].placeId }, birdId }],
  })) as GuestSendResult;
  const url = result.guestLinks[0].url;
  const flightId = result.flights[0].id;
  const [{ guest_link_id: linkId }] = await deps.db.query<{
    guest_link_id: string;
  }>("select guest_link_id from flights where id = $1", [flightId]);
  return {
    linkId,
    flightId,
    token: url.slice(url.lastIndexOf("-") + 1),
    arriveAt: result.flights[0].arriveAt as number,
  };
}

async function addressTo(linkId: string, who: UserId) {
  await deps.db.query(
    "update guest_links set notify_phone = (select phone from auth.users where id = $2) where id = $1",
    [linkId, who],
  );
}

async function befriend(status: "accepted" | "blocked" = "accepted") {
  const [a, b] = pair(max, rosa);
  await deps.db.query(
    `insert into friendships (a_id, b_id, status, blocked_by)
     values ($1, $2, $3, case when $3 = 'blocked' then $4::uuid end)`,
    [a, b, status, rosa],
  );
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

async function snapshot() {
  const tables = [
    "select * from guest_links order by id",
    "select * from friendships order by a_id, b_id",
    "select * from flights order by id",
    "select * from notes order by id",
    "select * from visits order by id",
    "select * from bird_meetings order by user_id, bird_id",
    "select * from events order by id",
  ];
  return Promise.all(tables.map((sql) => deps.db.query(sql)));
}

async function refusal(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return (error as { code: string }).code;
  }
  throw new Error("expected a refusal");
}

async function crossedSends() {
  const toRosa = await guestSend(max, world.max.birds[0].id, "Sam");
  const toMax = await guestSend(rosa, world.rosa.birds[0].id, "Mx");
  await addressTo(toMax.linkId, max);
  return { toRosa, toMax };
}

describe("resolveLinksBetween", () => {
  it("claims both crossed sends from one token claim and keeps each destination (ac-2)", async () => {
    const { toRosa, toMax } = await crossedSends();
    const before = {
      toRosa: await attribution(toRosa.linkId),
      toMax: await attribution(toMax.linkId),
    };

    await claimGuestLink(deps, rosa, PEPPER, IP, toRosa.token);

    expect(await attribution(toRosa.linkId)).toEqual({
      ...before.toRosa,
      status: "claimed",
      claimed_by: rosa,
      counterpart_id: rosa,
      recipient_id: rosa,
    });
    expect(await attribution(toMax.linkId)).toEqual({
      ...before.toMax,
      status: "claimed",
      claimed_by: max,
      counterpart_id: max,
      recipient_id: max,
    });
    expect(
      await deps.db.query(
        "select status, via from friendships where a_id = $1 and b_id = $2",
        pair(max, rosa),
      ),
    ).toEqual([{ status: "accepted", via: "guest_link" }]);
  });

  it("writes nothing for a blocked pair, and claim still refuses with forbidden (ac-3)", async () => {
    const { toRosa } = await crossedSends();
    await befriend("blocked");
    const before = await snapshot();

    expect(
      await deps.db.tx((db) =>
        resolveLinksBetween(db, max, rosa, deps.clock.now()),
      ),
    ).toEqual([]);
    expect(await snapshot()).toEqual(before);

    expect(
      await refusal(claimGuestLink(deps, rosa, PEPPER, IP, toRosa.token)),
    ).toBe("forbidden");
    expect(await snapshot()).toEqual(before);
  });

  it("finds a send addressed to my verified phone", async () => {
    const { linkId } = await guestSend(max, world.max.birds[0].id, "Sam");
    await addressTo(linkId, rosa);

    expect(await linksToMyPhone(deps.db, rosa)).toEqual([
      { id: linkId, senderId: max },
    ]);
    expect(await linksToMyPhone(deps.db, world.priya.id as UserId)).toEqual(
      [],
    );
  });

  describe("unique-name fallback (ac-4)", () => {
    async function landed(...names: string[]) {
      const sends = [];
      for (const [i, name] of names.entries())
        sends.push(await guestSend(max, world.max.birds[i].id, name));
      deps.clock.set(Math.max(...sends.map((s) => s.arriveAt)) + MINUTE);
      await tick(deps);
      return sends;
    }

    const resolve = () =>
      deps.db.tx((db) => resolveLinksBetween(db, max, rosa, deps.clock.now()));

    async function claimedBy() {
      const rows = await deps.db.query<{ claimed_by: string | null }>(
        "select claimed_by from guest_links order by id",
      );
      return rows.map((r) => r.claimed_by);
    }

    it("claims the one active link to a friend's name, ignoring case and spaces", async () => {
      await befriend();
      const [{ linkId }] = await landed("  rOSA ");

      expect(await resolve()).toEqual([
        { linkId, senderId: max, claimerId: rosa },
      ]);
      expect(await attribution(linkId)).toMatchObject({
        status: "claimed",
        claimed_by: rosa,
        counterpart_id: rosa,
        recipient_id: rosa,
      });
    });

    it("leaves two links with the same name alone", async () => {
      await befriend();
      await landed("Rosa", "rosa");

      expect(await resolve()).toEqual([]);
      expect(await claimedBy()).toEqual([null, null]);
    });

    it("leaves a link to a different name alone", async () => {
      await befriend();
      await landed("Sam");

      expect(await resolve()).toEqual([]);
      expect(await claimedBy()).toEqual([null]);
    });

    it("does not fire when the link has a phone", async () => {
      await befriend();
      const [{ linkId }] = await landed("Rosa");
      await deps.db.query(
        "update guest_links set notify_phone = '15559990000' where id = $1",
        [linkId],
      );

      expect(await resolve()).toEqual([]);
      expect(await claimedBy()).toEqual([null]);
    });

    it("does not fire when the pair is not friends", async () => {
      await landed("Rosa");

      expect(await resolve()).toEqual([]);
      expect(await claimedBy()).toEqual([null]);
    });
  });
});
