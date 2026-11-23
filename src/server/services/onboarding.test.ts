import { beforeEach, describe, expect, it, vi } from "vitest";
import { BLOCKED_NAMES } from "@/lib/blocklist";
import { config } from "@/lib/config";
import type { UserId } from "@/server/ports/auth";
import { pair } from "@/server/rows";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { sendGuestFlight } from "@/test/guestFlight";
import { seedWorld, type World } from "@/test/seedWorld";
import { asRole } from "@/test/testDb";
import { listFriends } from "./friends";
import { listNotes } from "./notes";
import { onboard, syncPhoneLast4 } from "./onboarding";
import { tick } from "./tick";

vi.mock("@/env", () => ({
  getEnv: () => ({ LINK_TOKEN_PEPPER: "test-pepper" }),
}));

const BODY = {
  name: "Max",
  timezone: "America/New_York",
  bird: { name: "Gerald", look: "gerald", pronoun: "he" },
};

let deps: TestDeps;

beforeEach(async () => {
  deps = await makeTestDeps();
});

async function newUser(): Promise<UserId> {
  const [{ id }] = await deps.db.query<{ id: UserId }>(
    "insert into auth.users default values returning id",
  );
  return id;
}

async function userWithPhone(phone: string): Promise<UserId> {
  const [{ id }] = await deps.db.query<{ id: UserId }>(
    "insert into auth.users (phone) values ($1) returning id",
    [phone],
  );
  return id;
}

async function phoneLast4(user: UserId) {
  const [row] = await deps.db.query<{ phone_last4: string | null }>(
    "select phone_last4 from profiles where id = $1",
    [user],
  );
  return row.phone_last4;
}

async function rows(user: string) {
  const q = (sql: string) =>
    deps.db.query<Record<string, unknown>>(sql, [user]);
  return {
    profiles: await q("select * from profiles where id = $1"),
    birds: await q("select * from birds where owner_id = $1 order by id"),
    gear: await q(
      "select * from gear_owned where user_id = $1 order by gear_id",
    ),
    outfits: await q("select * from outfits where user_id = $1 order by id"),
    eggs: await q("select * from eggs where user_id = $1"),
    ledger: await q("select * from seed_ledger where user_id = $1"),
  };
}

describe("onboard: a new person gets a working account (ac-1)", () => {
  it("creates one profile, one starter bird, bell and bow, three outfits, one egg at 5, and 60 welcome seeds", async () => {
    const user = await newUser();
    const result = await onboard(deps, user, BODY);
    const r = await rows(user);

    expect(r.profiles).toHaveLength(1);
    expect(r.profiles[0]).toMatchObject({
      name: "Max",
      handle: "max",
      timezone: "America/New_York",
      seeds: 60,
      onboarded_at: null,
    });
    expect(r.profiles[0].invite_code).toMatch(/^max.+/);

    const [first] = config.game.start.birds;
    expect(r.birds).toHaveLength(1);
    expect(r.birds[0]).toMatchObject({
      name: "Gerald",
      look: "gerald",
      pronoun: "he",
      speed_mph: first.speedMph,
      focus: first.focus,
      navigation: first.navigation,
      belly: 80,
      feathers: 80,
      energy: 100,
    });
    expect([first.speedMph, first.focus, first.navigation]).toEqual([45, 2, 4]);
    const quirks = r.birds[0].quirks as string[];
    expect(quirks).toHaveLength(2);
    expect(quirks.filter((q) => config.quirks.fears.includes(q))).toHaveLength(
      1,
    );
    expect(quirks.filter((q) => config.quirks.loves.includes(q))).toHaveLength(
      1,
    );

    expect(r.gear.map((g) => g.gear_id)).toEqual(["bell", "bow"]);
    expect(r.outfits.map((o) => o.name).sort()).toEqual([
      "Cold snap",
      "Everyday",
      "Fancy",
    ]);
    expect(r.eggs).toEqual([
      expect.objectContaining({ status: "incubating", hatch_at_delivery: 5 }),
    ]);
    expect(r.ledger).toEqual([
      expect.objectContaining({ delta: 60, reason: "welcome", ref_id: user }),
    ]);

    expect(result.me).toMatchObject({ id: user, handle: "max", seeds: 60 });
    expect(result.birds).toHaveLength(1);
  });

  it.each([
    ["a valid secondBird", { name: "Pip", pronoun: "she" }],
    ["a string secondBird", "x"],
    ["a wrong-typed secondBird", { name: 7 }],
    ["a blocklisted secondBird", { name: BLOCKED_NAMES[0], pronoun: "he" }],
  ])("ignores %s and creates exactly one bird", async (_, secondBird) => {
    const user = await newUser();
    const result = await onboard(deps, user, { ...BODY, secondBird });
    const r = await rows(user);

    expect(r.birds).toHaveLength(1);
    expect(r.birds[0]).toMatchObject({ name: "Gerald", speed_mph: 45 });
    expect(result.birds.map((b) => b.name)).toEqual(["Gerald"]);
    expect(r.outfits).toHaveLength(3);
    expect(r.eggs).toHaveLength(1);
    expect(r.ledger).toEqual([
      expect.objectContaining({ delta: 60, reason: "welcome" }),
    ]);
  });
});

describe("onboard: calling it again creates nothing and pays nothing (ac-2)", () => {
  it("leaves every row unchanged on a repeat with the same body and with a different body", async () => {
    const user = await newUser();
    const first = await onboard(deps, user, BODY);
    const before = await rows(user);

    const again = await onboard(deps, user, BODY);
    const other = await onboard(deps, user, {
      name: "Maxine",
      handle: "maxine",
      timezone: "Europe/London",
      bird: { name: "Pip", look: "kevin", pronoun: "she" },
      secondBird: { name: "Dot", pronoun: "they" },
    });

    expect(await rows(user)).toEqual(before);
    expect(before.profiles[0].seeds).toBe(60);
    expect(before.ledger).toHaveLength(1);
    expect(again.me.handle).toBe(first.me.handle);
    expect(other.me).toEqual(first.me);
  });
});

describe("onboard: handles are unique (ac-3)", () => {
  it("gives two people named Max different valid handles, the first being max", async () => {
    const a = await newUser();
    const b = await newUser();
    const first = await onboard(deps, a, BODY);
    const second = await onboard(deps, b, BODY);

    expect(first.me.handle).toBe("max");
    expect(second.me.handle).not.toBe("max");
    expect(second.me.handle).toMatch(/^[a-z0-9_]{2,20}$/);
    expect(second.me.inviteCode).not.toBe(first.me.inviteCode);
  });

  it("keeps a long generated handle within 20 characters when it needs a suffix", async () => {
    const name = "Bartholomew Pigeonfancier";
    await onboard(deps, await newUser(), { ...BODY, name });
    const second = await onboard(deps, await newUser(), { ...BODY, name });
    expect(second.me.handle).toMatch(/^[a-z0-9_]{2,20}$/);
  });

  it("refuses a typed handle someone else holds with conflict on handle, writing nothing", async () => {
    await onboard(deps, await newUser(), BODY);
    const user = await newUser();
    await expect(
      onboard(deps, user, { ...BODY, name: "Priya", handle: "max" }),
    ).rejects.toMatchObject({ code: "conflict", message: "handle" });
    expect((await rows(user)).profiles).toEqual([]);
  });

  it("uses a free typed handle as given", async () => {
    const result = await onboard(deps, await newUser(), {
      ...BODY,
      handle: "pigeon_max",
    });
    expect(result.me.handle).toBe("pigeon_max");
  });
});

describe("onboard: bad input is invalid and writes nothing (ac-4)", () => {
  const blocked = BLOCKED_NAMES[0];
  it.each([
    ["a 31-character name", { ...BODY, name: "M".repeat(31) }, "name"],
    ["a blocklisted name", { ...BODY, name: blocked }, "name"],
    [
      "a blocklisted bird name",
      { ...BODY, bird: { ...BODY.bird, name: blocked } },
      "bird.name",
    ],
    [
      "a name with a symbol inside a slur",
      { ...BODY, name: "xn\u2a74iggerx" },
      "name",
    ],
    [
      "a bird name with a symbol inside a slur",
      { ...BODY, bird: { ...BODY.bird, name: "xn\u2a74iggerx" } },
      "bird.name",
    ],
    [
      "a 25-character bird name",
      { ...BODY, bird: { ...BODY.bird, name: "G".repeat(25) } },
      "bird.name",
    ],
    [
      "a look that is not a starter look",
      { ...BODY, bird: { ...BODY.bird, look: "admiral" } },
      "bird.look",
    ],
    ["an unknown time zone", { ...BODY, timezone: "Mars/Olympus" }, "timezone"],
    ["a malformed handle", { ...BODY, handle: "a!" }, "handle"],
    ["a blank name", { ...BODY, name: "   " }, "name"],
    ["a name with a NUL", { ...BODY, name: "Ma\u0000x" }, "name"],
    [
      "a bird name with a NUL",
      { ...BODY, bird: { ...BODY.bird, name: "\u0000" } },
      "bird.name",
    ],
  ])("rejects %s", async (_, body, field) => {
    const user = await newUser();
    await expect(onboard(deps, user, body)).rejects.toMatchObject({
      code: "invalid",
      message: field,
    });
    const r = await rows(user);
    expect(Object.values(r).every((t) => t.length === 0)).toBe(true);
  });
});

describe("onboard: one person's onboarding never touches another's rows", () => {
  it("leaves A's account untouched when B onboards", async () => {
    const a = await newUser();
    await onboard(deps, a, BODY);
    const before = await rows(a);

    await onboard(deps, await newUser(), {
      ...BODY,
      name: "Priya",
      bird: { name: "Kevin", look: "kevin", pronoun: "she" },
    });

    expect(await rows(a)).toEqual(before);
  });
});

describe("onboard: the profile carries the last four digits of the Auth phone", () => {
  it("returns phoneLast4 and never the full number", async () => {
    const user = await userWithPhone("15551234567");
    const result = await onboard(deps, user, BODY);

    expect(result.me.phoneLast4).toBe("4567");
    const body = JSON.stringify(result);
    expect(body).not.toContain("5551234567");
    expect(body).not.toContain("15551234567");
  });

  it("fills a profile whose phone_last4 is null on a repeat onboard", async () => {
    const user = await userWithPhone("15551234567");
    await onboard(deps, user, BODY);
    await deps.db.query(
      "update profiles set phone_last4 = null where id = $1",
      [user],
    );

    const again = await onboard(deps, user, BODY);

    expect(again.me.phoneLast4).toBe("4567");
    expect(await phoneLast4(user)).toBe("4567");
  });

  it("onboards a user with no phone and leaves phoneLast4 null", async () => {
    const user = await newUser();
    const result = await onboard(deps, user, BODY);
    expect(result.me.phoneLast4).toBeNull();
    expect(await phoneLast4(user)).toBeNull();
  });
});

describe("onboard as the coo_app server role", () => {
  it("onboards a new user as coo_app and writes phone_last4 (ac-4)", async () => {
    const user = await userWithPhone("15551234567");

    const result = await onboard(
      { ...deps, db: asRole(deps.db, "coo_app") },
      user,
      BODY,
    );

    expect(result.me.phoneLast4).toBe("4567");
    expect(result.birds).toHaveLength(1);
    expect(await phoneLast4(user)).toBe("4567");
  });
});

describe("syncPhoneLast4 as coo_app", () => {
  it("returns the updated profile, then null when the phone has not changed", async () => {
    const user = await userWithPhone("15551234567");
    await onboard(deps, user, BODY);
    await deps.db.query(
      "update profiles set phone_last4 = null where id = $1",
      [user],
    );

    const first = await syncPhoneLast4(asRole(deps.db, "coo_app"), user);
    expect(first).toMatchObject({ id: user, phone_last4: "4567" });
    expect(await syncPhoneLast4(asRole(deps.db, "coo_app"), user)).toBeNull();
  });

  it("follows a phone change in Auth", async () => {
    const user = await userWithPhone("15551234567");
    await onboard(deps, user, BODY);
    await deps.db.query("update auth.users set phone = $2 where id = $1", [
      user,
      "15559876543",
    ]);

    expect(
      await syncPhoneLast4(asRole(deps.db, "coo_app"), user),
    ).toMatchObject({
      phone_last4: "6543",
    });
  });

  it("never changes another user's phone_last4", async () => {
    const a = await userWithPhone("15551234567");
    const b = await userWithPhone("15559990000");
    await onboard(deps, a, BODY);
    await onboard(deps, b, { ...BODY, name: "Priya" });
    await deps.db.query("update auth.users set phone = $2 where id = $1", [
      b,
      "15558887777",
    ]);
    await deps.db.query(
      "update profiles set phone_last4 = null where id = $1",
      [a],
    );

    await syncPhoneLast4(asRole(deps.db, "coo_app"), a);

    expect(await phoneLast4(a)).toBe("4567");
    expect(await phoneLast4(b)).toBe("0000");
  });
});

describe("onboard claims a guest send addressed to the new phone (ac-1)", () => {
  const PHONE = "15550000099";
  let world: World;
  let max: UserId;

  beforeEach(async () => {
    world = await seedWorld(deps.db, deps.clock.now());
    max = world.max.id as UserId;
  });

  async function addressedSend() {
    const sent = await sendGuestFlight(deps, world);
    const [{ id: linkId }] = await deps.db.query<{ id: string }>(
      `update guest_links set notify_phone = $2
       where id = (select guest_link_id from flights where id = $1) returning id`,
      [sent.flightId, PHONE],
    );
    return { ...sent, linkId };
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

  it("befriends the sender, claims the mid-flight link, and holds the note until it lands", async () => {
    const { linkId, arriveAt } = await addressedSend();
    const before = await attribution(linkId);
    deps.clock.advance(60_000);
    const user = await userWithPhone(PHONE);

    await onboard(deps, user, { ...BODY, name: "Bea" });

    expect(await attribution(linkId)).toEqual({
      ...before,
      status: "claimed",
      claimed_by: user,
      counterpart_id: user,
      recipient_id: user,
    });
    expect(
      await deps.db.query(
        "select status, via from friendships where a_id = $1 and b_id = $2",
        pair(max, user),
      ),
    ).toEqual([{ status: "accepted", via: "guest_link" }]);
    const { friends, guestLinks } = await listFriends(deps, max);
    expect(friends.map((f) => f.id)).toContain(user);
    expect(guestLinks).toEqual([]);
    expect(
      await deps.db.query(
        "select kind, ref_id from notifications where user_id = $1",
        [max],
      ),
    ).toEqual([{ kind: "friend-joined", ref_id: linkId }]);

    const shoebox = async () => (await listNotes(deps, user, {})).notes;
    expect(await shoebox()).toEqual([]);
    deps.clock.set(arriveAt - 1);
    await tick(deps);
    expect(await shoebox()).toEqual([]);
    deps.clock.set(arriveAt + 60_000);
    await tick(deps);
    expect(await shoebox()).toEqual([
      expect.objectContaining({
        direction: "received",
        state: "delivered",
        body: "Come see the new loft",
        deliveredAt: expect.any(Number),
      }),
    ]);
  });

  it("claims the send in a coo_app transaction and changes nothing on a second onboard", async () => {
    const { linkId } = await addressedSend();
    const user = await userWithPhone(PHONE);
    const app = {
      ...deps,
      db: { ...deps.db, tx: asRole(deps.db, "coo_app").tx },
    };

    await onboard(app, user, { ...BODY, name: "Bea" });
    const after = await attribution(linkId);
    await onboard(app, user, { ...BODY, name: "Bea" });

    expect(after).toMatchObject({ status: "claimed", claimed_by: user });
    expect(await attribution(linkId)).toEqual(after);
    expect(
      await deps.db.query("select 1 from notifications where user_id = $1", [
        max,
      ]),
    ).toHaveLength(1);
  });

  it("leaves the link alone for a different phone", async () => {
    const { linkId } = await addressedSend();
    const user = await userWithPhone("15550000098");

    await onboard(deps, user, { ...BODY, name: "Bea" });

    expect(await attribution(linkId)).toMatchObject({
      status: "active",
      claimed_by: null,
    });
    expect(
      (await listFriends(deps, max)).friends.map((f) => f.id),
    ).not.toContain(user);
  });
});
