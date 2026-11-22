import { beforeEach, describe, expect, it, vi } from "vitest";
import { guestClaimPost } from "@/app/api/guest/[token]/claim/post";
import { guestGet } from "@/app/api/guest/[token]/get";
import type { Db } from "@/server/db";
import type { UserId } from "@/server/ports/auth";
import { pair } from "@/server/rows";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { geoClient } from "@/test/geoRoute";
import { getGuestLink } from "./guestLinks/get";
import { seedWorld, type World } from "@/test/seedWorld";
import type { GuestSendResult } from "./flights/guestSend";
import { send } from "./flights/send";
import { searchPlaces } from "./places";
import { tick } from "./tick";

vi.mock("@/env", () => ({
  getEnv: () => ({ LINK_TOKEN_PEPPER: PEPPER }),
}));

const PEPPER = "test-pepper";
const NOTE = "Come see the new loft on Saturday";
const MINUTE_MS = 60_000;
const EXPIRE_MS = 7 * 86_400_000;

let deps: TestDeps;
let world: World;
let max: UserId;
let gerald: string;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
  max = world.max.id as UserId;
  gerald = world.max.birds[0].id;
});

function publicGet(path: string) {
  return geoClient(deps, (r) => guestGet(r, () => PEPPER), path).get({});
}

function withoutServerNow(json: Record<string, unknown>) {
  const { serverNow, ...rest } = json;
  expect(typeof serverNow).toBe("number");
  return rest;
}

async function sendToSam() {
  const { results } = await searchPlaces(deps, max, "Williamsburg");
  const result = (await send(deps, max, {
    body: NOTE,
    sends: [
      { guest: { name: "Sam", placeId: results[0].placeId }, birdId: gerald },
    ],
  })) as GuestSendResult;
  const [{ flightId, url }] = result.guestLinks;
  return {
    flightId,
    token: url.slice(url.lastIndexOf("-") + 1),
    arriveAt: result.flights[0].arriveAt as number,
  };
}

async function linkState() {
  const [row] = await deps.db.query<{
    status: string;
    returned_at: Date | null;
  }>(
    `select g.status, n.returned_at from guest_links g
     join notes n on n.guest_link_id = g.id`,
  );
  return row;
}

async function expiredNotices() {
  return deps.db.query<{ title: string; body: string; url: string }>(
    "select title, body, url from notifications where kind = 'link-expired' and user_id = $1",
    [max],
  );
}

describe("scenario 6: guest (public parts)", () => {
  it("a stranger follows Max's link, sees Gerald flying but not the note, then reads it after landing", async () => {
    const { flightId, token, arriveAt } = await sendToSam();

    const links = await deps.db.query<{ id: string; token_hash: string }>(
      "select id, token_hash from guest_links",
    );
    expect(links).toHaveLength(1);
    expect(links[0].token_hash).not.toContain(token);
    const [flight] = await deps.db.query<{ guest_link_id: string }>(
      "select guest_link_id from flights where id = $1",
      [flightId],
    );
    expect(flight.guest_link_id).toBe(links[0].id);

    const flying = await publicGet(`/api/guest/${token}`);
    expect(flying.status).toBe(200);
    expect(flying.json).not.toHaveProperty("note");
    expect(JSON.stringify(flying.json)).not.toContain(NOTE);
    expect(flying.json).toMatchObject({
      senderName: "Max",
      recipientName: "Sam",
      flight: { status: "flying" },
    });

    const wrong = await publicGet("/api/guest/AAAAAAAAAAAAAAAA");
    const missing = await publicGet("/api/guest/");
    expect(wrong.status).toBe(404);
    expect(wrong.json.error.code).toBe("not_found");
    expect(missing.status).toBe(404);
    expect(withoutServerNow(missing.json)).toEqual(
      withoutServerNow(wrong.json),
    );

    deps.clock.set(arriveAt + MINUTE_MS);
    await tick(deps);

    const landed = await publicGet(`/api/guest/${token}`);
    expect(landed.status).toBe(200);
    expect(landed.json).toMatchObject({
      flight: { status: "landed" },
      note: { body: NOTE },
    });
  });
});

describe("scenario 6: guest (expiry)", () => {
  it("an unopened link expires 7 days after landing, the note comes back and Max is told once", async () => {
    const { token, arriveAt } = await sendToSam();
    deps.clock.set(arriveAt + MINUTE_MS);
    await tick(deps);

    deps.clock.set(arriveAt + EXPIRE_MS - MINUTE_MS);
    await tick(deps);
    expect(await linkState()).toEqual({ status: "active", returned_at: null });
    expect(await expiredNotices()).toEqual([]);

    deps.clock.set(arriveAt + EXPIRE_MS + MINUTE_MS);
    await tick(deps);
    await tick(deps);

    const state = await linkState();
    expect(state.status).toBe("expired");
    expect(state.returned_at).toBeInstanceOf(Date);
    expect(await expiredNotices()).toEqual([
      {
        title: "Your note to Sam came back",
        body: "The link was not opened in 7 days.",
        url: "/shoebox",
      },
    ]);
    const gone = await publicGet(`/api/guest/${token}`);
    expect(gone.status).toBe(410);
    expect(gone.json.error.code).toBe("gone");
  });

  it("an opened but unclaimed link expires without bringing the note back or telling Max", async () => {
    const { token, arriveAt } = await sendToSam();
    deps.clock.set(arriveAt + MINUTE_MS);
    await tick(deps);
    expect((await publicGet(`/api/guest/${token}`)).status).toBe(200);

    deps.clock.set(arriveAt + EXPIRE_MS + MINUTE_MS);
    await tick(deps);

    expect(await linkState()).toEqual({ status: "expired", returned_at: null });
    expect(await expiredNotices()).toEqual([]);
    expect((await publicGet(`/api/guest/${token}`)).status).toBe(410);
  });

  it("a view read before expiry but recorded after it is refused, so the note comes back exactly once", async () => {
    const { token, arriveAt } = await sendToSam();
    deps.clock.set(arriveAt + MINUTE_MS);
    await tick(deps);
    const [{ expires_at }] = await deps.db.query<{ expires_at: Date }>(
      "select expires_at from guest_links",
    );
    const expiresAt = expires_at.getTime();

    let reachOpening = () => {};
    const atOpening = new Promise<void>((resolve) => (reachOpening = resolve));
    let resume = () => {};
    const resumed = new Promise<void>((resolve) => (resume = resolve));
    const paused: Db = {
      async query<T>(sql: string, params?: unknown[]) {
        if (sql.includes("set opened_at")) {
          reachOpening();
          await resumed;
        }
        return deps.db.query<T>(sql, params);
      },
      tx: (fn) => deps.db.tx(fn),
    };

    deps.clock.set(expiresAt - 1);
    const view = getGuestLink(
      { ...deps, db: paused },
      PEPPER,
      "203.0.113.7",
      token,
    );
    await atOpening;
    deps.clock.set(expiresAt);
    await tick(deps);
    resume();

    await expect(view).rejects.toMatchObject({ code: "gone" });
    const [row] = await deps.db.query<{ opened_at: Date | null }>(
      "select opened_at from guest_links",
    );
    expect(row.opened_at).toBeNull();
    const state = await linkState();
    expect(state.status).toBe("expired");
    expect(state.returned_at).toBeInstanceOf(Date);
    expect(await expiredNotices()).toHaveLength(1);
  });

  it("a view recorded just before expiry keeps the note with the guest and tells Max nothing", async () => {
    const { token, arriveAt } = await sendToSam();
    deps.clock.set(arriveAt + MINUTE_MS);
    await tick(deps);
    const [{ expires_at }] = await deps.db.query<{ expires_at: Date }>(
      "select expires_at from guest_links",
    );

    deps.clock.set(expires_at.getTime() - 1);
    const seen = await publicGet(`/api/guest/${token}`);
    expect(seen.json).toMatchObject({ note: { body: NOTE } });
    deps.clock.set(expires_at.getTime());
    await tick(deps);

    expect(await linkState()).toEqual({ status: "expired", returned_at: null });
    expect(await expiredNotices()).toEqual([]);
  });

  it("a claimed link is left alone after 7 days", async () => {
    const { arriveAt } = await sendToSam();
    deps.clock.set(arriveAt + MINUTE_MS);
    await tick(deps);
    await deps.db.query(
      "update guest_links set status = 'claimed', claimed_by = $1, claimed_at = $2",
      [world.priya.id, new Date(deps.clock.now()).toISOString()],
    );

    deps.clock.set(arriveAt + EXPIRE_MS + MINUTE_MS);
    await tick(deps);

    expect(await linkState()).toEqual({ status: "claimed", returned_at: null });
    expect(await expiredNotices()).toEqual([]);
  });
});

describe("scenario 6: guest (claim)", () => {
  it("Sam claims Max's landed note: they become friends, the waiting visit moves to Sam and Max is told once", async () => {
    const rosa = world.rosa.id as UserId;
    await deps.db.query(
      "delete from friendships where a_id = $1 and b_id = $2",
      [...pair(max, rosa)],
    );
    const { flightId, token, arriveAt } = await sendToSam();
    deps.clock.set(arriveAt + MINUTE_MS);
    await tick(deps);

    const claimer = geoClient(
      deps,
      (r) => guestClaimPost(r, () => PEPPER),
      `/api/guest/${token}/claim`,
    );
    const { jar } = await claimer.signIn("+15550000003");

    const first = await claimer.post({}, jar);
    expect(first.status).toBe(200);
    const [visit] = await deps.db.query<{ id: string; host_id: string }>(
      "select id, host_id from visits where flight_id = $1",
      [flightId],
    );
    expect(withoutServerNow(first.json)).toEqual({
      friendId: max,
      visitId: visit.id,
    });
    expect(visit.host_id).toBe(rosa);

    const friendships = await deps.db.query<{ via: string; status: string }>(
      "select via, status from friendships where a_id = $1 and b_id = $2",
      [...pair(max, rosa)],
    );
    expect(friendships).toEqual([{ via: "guest_link", status: "accepted" }]);
    const [delivered] = await deps.db.query<{
      counterpart_id: string;
      recipient_id: string;
    }>(
      `select f.counterpart_id, n.recipient_id from flights f
       join notes n on n.id = f.note_id where f.id = $1`,
      [flightId],
    );
    expect(delivered).toEqual({ counterpart_id: rosa, recipient_id: rosa });
    expect(await linkState()).toEqual({ status: "claimed", returned_at: null });

    const again = await claimer.post({}, jar);
    expect(again.status).toBe(200);
    expect(withoutServerNow(again.json)).toEqual(withoutServerNow(first.json));

    const joined = await deps.db.query<{ title: string }>(
      "select title from notifications where kind = 'friend-joined' and user_id = $1",
      [max],
    );
    expect(joined).toEqual([{ title: "Rosa made a loft" }]);
  });
});
