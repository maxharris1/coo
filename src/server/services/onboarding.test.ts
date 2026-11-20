import { beforeEach, describe, expect, it } from "vitest";
import { BLOCKED_NAMES } from "@/lib/blocklist";
import { config } from "@/lib/config";
import type { UserId } from "@/server/ports/auth";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { onboard } from "./onboarding";

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
  it("creates one profile, two starter birds, bell and bow, three outfits, one egg at 5, and 60 welcome seeds", async () => {
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

    const stats = r.birds
      .map((b) => [b.speed_mph, b.focus, b.navigation])
      .sort((a, b) => Number(a[0]) - Number(b[0]));
    expect(stats).toEqual([
      [45, 2, 4],
      [54, 1, 3],
    ]);
    for (const b of r.birds) {
      expect(b).toMatchObject({ belly: 80, feathers: 80, energy: 100 });
      const quirks = b.quirks as string[];
      expect(quirks).toHaveLength(2);
      expect(
        quirks.filter((q) => config.quirks.fears.includes(q)),
      ).toHaveLength(1);
      expect(
        quirks.filter((q) => config.quirks.loves.includes(q)),
      ).toHaveLength(1);
    }
    expect(r.birds.find((b) => b.speed_mph === 45)).toMatchObject({
      name: "Gerald",
      look: "gerald",
      pronoun: "he",
    });

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
    expect(result.birds).toHaveLength(2);
  });

  it("names the second bird from secondBird when given", async () => {
    const user = await newUser();
    await onboard(deps, user, {
      ...BODY,
      secondBird: { name: "Pip", pronoun: "she" },
    });
    const [second] = await deps.db.query<{ name: string; pronoun: string }>(
      "select name, pronoun from birds where owner_id = $1 and speed_mph = 54",
      [user],
    );
    expect(second).toEqual({ name: "Pip", pronoun: "she" });
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
      "a blocklisted second bird name",
      { ...BODY, secondBird: { name: blocked, pronoun: "he" } },
      "secondBird.name",
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
