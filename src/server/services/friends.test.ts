import { beforeEach, describe, expect, it } from "vitest";
import type { UserId } from "@/server/ports/auth";
import { onboard } from "@/server/services/onboarding";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { friendshipBetween, joinByCode } from "./friends";

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
  await deps.db.query(
    "insert into auth.users (id) select unnest($1::uuid[])",
    [Object.values(ids)],
  );
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
