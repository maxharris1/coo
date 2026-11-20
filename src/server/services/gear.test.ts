import { beforeEach, describe, expect, it } from "vitest";
import type { OnboardedCaller, Profile } from "@/server/auth";
import type { UserId } from "@/server/ports/auth";
import { toBirdRecord, type Row } from "@/server/rows";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { seedWorld, type World } from "@/test/seedWorld";
import { putGear } from "./gear";

const HOUR = 3_600_000;

let deps: TestDeps;
let world: World;
let max: OnboardedCaller;
let gerald: string;
let brenda: string;

async function callerFor(id: string): Promise<OnboardedCaller> {
  const [profile] = await deps.db.query<Profile & { onboarded_at: Date }>(
    "select * from profiles where id = $1",
    [id],
  );
  return { userId: id as UserId, profile };
}

async function own(userId: string, ...items: string[]) {
  await deps.db.query(
    "insert into gear_owned (user_id, gear_id) select $1, unnest($2::text[])",
    [userId, items],
  );
}

async function setBird(id: string, set: string, params: unknown[] = []) {
  await deps.db.query(`update birds set ${set} where id = $1`, [id, ...params]);
}

async function gearOf(id: string): Promise<string[]> {
  const [row] = await deps.db.query<{ gear: string[] }>(
    "select gear from birds where id = $1",
    [id],
  );
  return row.gear;
}

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
  max = await callerFor(world.max.id);
  [gerald, brenda] = world.max.birds.map((b) => b.id);
  await own(world.max.id, "goggles", "beanie", "scarf");
});

describe("putGear: one item per slot (ac-1)", () => {
  it("putting on goggles then a beanie leaves only the beanie on the head slot", async () => {
    await putGear(deps, max, gerald, { items: ["goggles"] });
    const { bird } = await putGear(deps, max, gerald, { items: ["beanie"] });

    expect(bird.gear).toEqual(["beanie"]);
    expect(await gearOf(gerald)).toEqual(["beanie"]);
  });

  it("refuses two head items in one request and leaves the gear as it was", async () => {
    await putGear(deps, max, gerald, { items: ["goggles", "bow"] });

    await expect(
      putGear(deps, max, gerald, { items: ["goggles", "beanie"] }),
    ).rejects.toMatchObject({ code: "invalid" });
    expect(await gearOf(gerald)).toEqual(["goggles", "bow"]);
  });

  it("refuses an item the user does not own or an unknown id", async () => {
    await expect(
      putGear(deps, max, gerald, { items: ["rainhat"] }),
    ).rejects.toMatchObject({ code: "invalid" });
    await expect(
      putGear(deps, max, gerald, { items: ["jetpack"] }),
    ).rejects.toMatchObject({ code: "invalid" });
    expect(await gearOf(gerald)).toEqual([]);
  });

  it("empties the bird when given no items", async () => {
    await putGear(deps, max, gerald, { items: ["goggles", "scarf"] });
    const { bird } = await putGear(deps, max, gerald, { items: [] });

    expect(bird.gear).toEqual([]);
    expect(await gearOf(gerald)).toEqual([]);
  });

  it("stores the gear that the bird record, and so Send's flight input, reads", async () => {
    await putGear(deps, max, gerald, { items: ["beanie", "scarf"] });
    const [row] = await deps.db.query<Row<"birds">>(
      "select * from birds where id = $1",
      [gerald],
    );

    expect(toBirdRecord(row).gear).toEqual(["beanie", "scarf"]);
  });
});

describe("putGear: taking from another home bird (ac-2)", () => {
  it("moves an item off another home bird", async () => {
    await putGear(deps, max, brenda, { items: ["scarf", "bell"] });
    const { bird } = await putGear(deps, max, gerald, { items: ["scarf"] });

    expect(bird.gear).toEqual(["scarf"]);
    expect(await gearOf(gerald)).toEqual(["scarf"]);
    expect(await gearOf(brenda)).toEqual(["bell"]);
  });

  it("gives the same rows when the same move runs twice", async () => {
    await putGear(deps, max, brenda, { items: ["scarf", "bell"] });
    await putGear(deps, max, gerald, { items: ["scarf"] });
    await putGear(deps, max, gerald, { items: ["scarf"] });

    expect(await gearOf(gerald)).toEqual(["scarf"]);
    expect(await gearOf(brenda)).toEqual(["bell"]);
  });

  it("takes from a bird whose busy time has ended, which counts as home", async () => {
    await putGear(deps, max, brenda, { items: ["scarf"] });
    await setBird(
      brenda,
      "status = 'busy', busy_kind = 'job', busy_until = to_timestamp($2 / 1000.0)",
      [deps.clock.now() - HOUR],
    );
    await putGear(deps, max, gerald, { items: ["scarf"] });

    expect(await gearOf(gerald)).toEqual(["scarf"]);
    expect(await gearOf(brenda)).toEqual([]);
  });

  it.each(["flying", "visiting", "scheduled"])(
    "refuses to take an item from a bird that is %s",
    async (status) => {
      await putGear(deps, max, brenda, { items: ["scarf"] });
      await setBird(brenda, `status = '${status}'`);

      await expect(
        putGear(deps, max, gerald, { items: ["scarf"] }),
      ).rejects.toMatchObject({ code: "conflict" });
      expect(await gearOf(gerald)).toEqual([]);
      expect(await gearOf(brenda)).toEqual(["scarf"]);
    },
  );

  it("refuses to take an item from a bird that is still busy", async () => {
    await putGear(deps, max, brenda, { items: ["scarf"] });
    await setBird(
      brenda,
      "status = 'busy', busy_kind = 'job', busy_until = to_timestamp($2 / 1000.0)",
      [deps.clock.now() + HOUR],
    );

    await expect(
      putGear(deps, max, gerald, { items: ["scarf"] }),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(await gearOf(brenda)).toEqual(["scarf"]);
  });

  it("refuses to dress a bird that is away", async () => {
    await setBird(gerald, "status = 'flying'");

    await expect(
      putGear(deps, max, gerald, { items: ["goggles"] }),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(await gearOf(gerald)).toEqual([]);
  });
});

describe("putGear: someone else's bird", () => {
  it("answers not_found for another user's bird and leaves it unchanged", async () => {
    const [kevin] = world.priya.birds;
    await setBird(kevin.id, "gear = $2", [["bow"]]);

    await expect(
      putGear(deps, max, kevin.id, { items: ["goggles"] }),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(await gearOf(kevin.id)).toEqual(["bow"]);
  });

  it("answers not_found for a bird id that does not exist", async () => {
    await expect(
      putGear(deps, max, "00000000-0000-4000-b000-000000000099", {
        items: ["goggles"],
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("never takes an item off another user's bird", async () => {
    const priya = await callerFor(world.priya.id);
    await putGear(deps, priya, world.priya.birds[0].id, { items: ["bow"] });
    await putGear(deps, max, gerald, { items: ["bow"] });

    expect(await gearOf(world.priya.birds[0].id)).toEqual(["bow"]);
    expect(await gearOf(gerald)).toEqual(["bow"]);
  });
});
