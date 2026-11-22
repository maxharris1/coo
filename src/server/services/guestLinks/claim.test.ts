import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OnboardedCaller, Profile } from "@/server/auth";
import type { Db } from "@/server/db";
import type { UserId } from "@/server/ports/auth";
import { pair } from "@/server/rows";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { sendGuestFlight } from "@/test/guestFlight";
import { seedWorld, type World } from "@/test/seedWorld";
import { tick } from "../tick";
import { replyToVisit } from "../visits/reply";
import { claimGuestLink } from "./claim";
import { reportGuestLink } from "./report";

vi.mock("@/env", () => ({
  getEnv: () => ({ LINK_TOKEN_PEPPER: PEPPER }),
}));

const PEPPER = "test-pepper";
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

let deps: TestDeps;
let world: World;
let max: UserId;
let rosa: UserId;
let priya: UserId;
let gerald: string;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
  max = world.max.id as UserId;
  rosa = world.rosa.id as UserId;
  priya = world.priya.id as UserId;
  gerald = world.max.birds[0].id;
  await deps.db.query("delete from friendships where a_id = $1 and b_id = $2", [
    ...pair(max, rosa),
  ]);
});

async function landedLink() {
  const sent = await sendGuestFlight(deps, world);
  deps.clock.set(sent.arriveAt + MINUTE);
  await tick(deps);
  return sent;
}

const claim = (who: UserId, token: string) =>
  claimGuestLink(deps, who, PEPPER, token);

function claimWhileLocking(who: UserId, token: string, lockedAt: number) {
  const slow = (base: Db): Db => ({
    query<T>(sql: string, params?: unknown[]) {
      if (sql.includes("for update")) deps.clock.set(lockedAt);
      return base.query<T>(sql, params);
    },
    tx: (fn) => base.tx((tx) => fn(slow(tx))),
  });
  return claimGuestLink({ ...deps, db: slow(deps.db) }, who, PEPPER, token);
}

async function refusal(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return (error as { code: string }).code;
  }
  throw new Error("expected a refusal");
}

async function snapshot() {
  const tables = [
    "select id, status, claimed_by, claimed_at from guest_links",
    "select * from friendships order by a_id, b_id",
    "select id, host_id, status from visits",
    "select id, recipient_id from notes",
    "select id, counterpart_id from flights",
    "select * from bird_meetings order by user_id, bird_id",
    "select user_id, kind, ref_id from notifications order by created_at, id",
    "select user_id, kind from events order by id",
  ];
  return Promise.all(tables.map((sql) => deps.db.query(sql)));
}

async function callerFor(id: string): Promise<OnboardedCaller> {
  const [profile] = await deps.db.query<Profile & { onboarded_at: Date }>(
    "select * from profiles where id = $1",
    [id],
  );
  return { userId: id as UserId, profile };
}

describe("claimGuestLink", () => {
  it("claims once for the same user and changes nothing the second time (ac-2)", async () => {
    const { token } = await landedLink();

    const first = await claim(rosa, token);
    const after = await snapshot();
    const second = await claim(rosa, token);

    expect(first).toEqual({ friendId: max, visitId: expect.any(String) });
    expect(second).toEqual(first);
    expect(await snapshot()).toEqual(after);
  });

  it("refuses a second user with gone and leaves the claim alone (ac-2)", async () => {
    const { token } = await landedLink();
    await claim(rosa, token);
    const before = await snapshot();

    expect(await refusal(claim(priya, token))).toBe("gone");
    expect(await snapshot()).toEqual(before);
  });

  it("refuses the sender with conflict, before and after a claim (ac-2)", async () => {
    const { token } = await landedLink();
    const before = await snapshot();

    expect(await refusal(claim(max, token))).toBe("conflict");
    expect(await snapshot()).toEqual(before);

    await claim(rosa, token);
    expect(await refusal(claim(max, token))).toBe("conflict");
  });

  it("lets exactly one of two racing users claim (ac-2)", async () => {
    const { token } = await landedLink();

    const results = await Promise.allSettled([
      claim(rosa, token),
      claim(priya, token),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const [rejected] = results.filter((r) => r.status === "rejected");
    expect((rejected as PromiseRejectedResult).reason.code).toBe("gone");
  });

  it("answers gone for a reported link", async () => {
    const { token } = await landedLink();
    await reportGuestLink(deps, PEPPER, "203.0.113.7", token, "Spam");

    expect(await refusal(claim(rosa, token))).toBe("gone");
  });

  it("answers gone for a link past its expiry", async () => {
    const { token, arriveAt } = await landedLink();
    deps.clock.set(arriveAt + 7 * DAY + MINUTE);

    expect(await refusal(claim(rosa, token))).toBe("gone");
  });

  it("answers gone when the link expires while the claim waits for its locks", async () => {
    const { token, arriveAt } = await landedLink();
    const expiresAt = arriveAt + 7 * DAY;
    deps.clock.set(expiresAt - 1);
    const before = await snapshot();

    expect(await refusal(claimWhileLocking(rosa, token, expiresAt + 1))).toBe(
      "gone",
    );
    expect(await snapshot()).toEqual(before);
  });

  it("offers no visit when the 30 minutes end while the claim waits for its locks (ac-3)", async () => {
    const { token, flightId, arriveAt } = await landedLink();
    const leavesAt = arriveAt + 30 * MINUTE;
    deps.clock.set(leavesAt - 1);

    const result = await claimWhileLocking(rosa, token, leavesAt + 1);

    expect(result).toEqual({ friendId: max });
    expect(
      await deps.db.query("select host_id from visits where flight_id = $1", [
        flightId,
      ]),
    ).toEqual([{ host_id: null }]);
  });

  it("answers not_found for a wrong or malformed token", async () => {
    await landedLink();

    expect(await refusal(claim(rosa, "AAAAAAAAAAAAAAAA"))).toBe("not_found");
    expect(await refusal(claim(rosa, "short"))).toBe("not_found");
  });

  it("makes the claimer the friend, recipient and visit host, and they can reply (ac-3)", async () => {
    const { token, flightId, arriveAt } = await landedLink();
    deps.clock.set(arriveAt + 10 * MINUTE);

    const { visitId } = await claim(rosa, token);

    const [visit] = await deps.db.query<{ id: string; host_id: string }>(
      "select id, host_id from visits where flight_id = $1",
      [flightId],
    );
    expect(visitId).toBe(visit.id);
    expect(visit.host_id).toBe(rosa);
    expect(
      await deps.db.query(
        "select status, via from friendships where a_id = $1 and b_id = $2",
        pair(max, rosa),
      ),
    ).toEqual([{ status: "accepted", via: "guest_link" }]);
    expect(
      await deps.db.query(
        `select f.counterpart_id, n.recipient_id from flights f
         join notes n on n.id = f.note_id where f.id = $1`,
        [flightId],
      ),
    ).toEqual([{ counterpart_id: rosa, recipient_id: rosa }]);
    expect(
      await deps.db.query("select status, claimed_by from guest_links"),
    ).toEqual([{ status: "claimed", claimed_by: rosa }]);
    expect(
      await deps.db.query(
        "select user_id from bird_meetings where bird_id = $1",
        [gerald],
      ),
    ).toEqual([{ user_id: rosa }]);
    expect(
      await deps.db.query(
        "select user_id, title from notifications where kind = 'friend-joined'",
      ),
    ).toEqual([{ user_id: max, title: "Rosa made a loft" }]);

    const { flight } = await replyToVisit(
      deps,
      await callerFor(rosa),
      visit.id,
      "Saturday works",
    );
    expect(flight).toMatchObject({ kind: "return" });
    const [reply] = await deps.db.query<{
      sender_id: string;
      recipient_id: string;
    }>(
      "select sender_id, recipient_id from notes where body = 'Saturday works'",
    );
    expect(reply).toEqual({ sender_id: rosa, recipient_id: max });
  });

  it("leaves the host alone once the 30 minutes are over (ac-3)", async () => {
    const { token, flightId, arriveAt } = await landedLink();
    deps.clock.set(arriveAt + 31 * MINUTE);
    await tick(deps);

    const result = await claim(rosa, token);

    expect(result).toEqual({ friendId: max });
    const [visit] = await deps.db.query<{ host_id: string | null }>(
      "select host_id from visits where flight_id = $1",
      [flightId],
    );
    expect(visit.host_id).toBeNull();
  });

  it("makes the claimer the host when the bird lands after the claim (ac-3)", async () => {
    const { token, flightId, arriveAt } = await sendGuestFlight(deps, world);

    expect(await claim(rosa, token)).toEqual({ friendId: max });
    deps.clock.set(arriveAt + MINUTE);
    await tick(deps);

    const [visit] = await deps.db.query<{ host_id: string }>(
      "select host_id from visits where flight_id = $1",
      [flightId],
    );
    expect(visit.host_id).toBe(rosa);
  });

  it("refuses a blocked pair with forbidden and writes nothing (ac-4)", async () => {
    const { token } = await landedLink();
    const [a, b] = pair(max, rosa);
    await deps.db.query(
      `insert into friendships (a_id, b_id, status, blocked_by)
       values ($1, $2, 'blocked', $3)`,
      [a, b, rosa],
    );
    const before = await snapshot();

    expect(await refusal(claim(rosa, token))).toBe("forbidden");
    expect(await snapshot()).toEqual(before);
  });
});
