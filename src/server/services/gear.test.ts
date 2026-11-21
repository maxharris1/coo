import { beforeEach, describe, expect, it } from "vitest";
import type { OnboardedCaller, Profile } from "@/server/auth";
import type { UserId } from "@/server/ports/auth";
import { toBirdRecord, type Row } from "@/server/rows";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { seedWorld, type World } from "@/test/seedWorld";
import { putGear, saveOutfits } from "./gear";

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

async function addOutfit(userId: string, name: string, items: string[]) {
  const [row] = await deps.db.query<{ id: string }>(
    "insert into outfits (user_id, name, items) values ($1, $2, $3) returning id",
    [userId, name, items],
  );
  return row.id;
}

async function outfitsOf(userId: string) {
  return deps.db.query<{
    id: string;
    name: string;
    items: string[];
    position: number;
  }>(
    "select id, name, items, position from outfits where user_id = $1 order by position, id",
    [userId],
  );
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

describe("putGear: applying a saved outfit (ac-3)", () => {
  it("puts on the owned and free items and skips the rest", async () => {
    await putGear(deps, max, brenda, { items: ["bow"] });
    await putGear(deps, max, gerald, { items: ["goggles", "bell"] });
    const outfitId = await addOutfit(world.max.id, "Rainy", [
      "goggles",
      "bow",
      "band",
      "backpack",
    ]);

    const { bird, skipped } = await putGear(deps, max, gerald, { outfitId });

    expect(bird.gear).toEqual(["goggles"]);
    expect(skipped).toEqual(["bow", "band", "backpack"]);
    expect(await gearOf(gerald)).toEqual(["goggles"]);
    expect(await gearOf(brenda)).toEqual(["bow"]);
  });

  it("skips an item worn by an away bird instead of refusing", async () => {
    await putGear(deps, max, brenda, { items: ["scarf"] });
    await setBird(brenda, "status = 'flying'");
    const outfitId = await addOutfit(world.max.id, "Cosy", ["beanie", "scarf"]);

    const { bird, skipped } = await putGear(deps, max, gerald, { outfitId });

    expect(bird.gear).toEqual(["beanie"]);
    expect(skipped).toEqual(["scarf"]);
    expect(await gearOf(brenda)).toEqual(["scarf"]);
  });

  it("gives the same rows when the same outfit is applied twice", async () => {
    const outfitId = await addOutfit(world.max.id, "Cosy", ["beanie", "bow"]);
    await putGear(deps, max, gerald, { outfitId });
    const { skipped } = await putGear(deps, max, gerald, { outfitId });

    expect(skipped).toEqual([]);
    expect(await gearOf(gerald)).toEqual(["beanie", "bow"]);
  });

  it("returns no skipped items for a plain list of items", async () => {
    const { skipped } = await putGear(deps, max, gerald, {
      items: ["goggles"],
    });
    expect(skipped).toEqual([]);
  });

  it("answers not_found for another user's outfit and changes nothing", async () => {
    await putGear(deps, max, gerald, { items: ["beanie"] });
    const outfitId = await addOutfit(world.priya.id, "Hers", ["goggles"]);

    await expect(
      putGear(deps, max, gerald, { outfitId }),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(await gearOf(gerald)).toEqual(["beanie"]);
  });

  it("refuses to dress a bird that is away", async () => {
    const outfitId = await addOutfit(world.max.id, "Cosy", ["beanie"]);
    await setBird(gerald, "status = 'flying'");

    await expect(
      putGear(deps, max, gerald, { outfitId }),
    ).rejects.toMatchObject({ code: "conflict" });
    expect(await gearOf(gerald)).toEqual([]);
  });
});

describe("saveOutfits", () => {
  const outfit = (name: string, items: string[], id?: string) =>
    id ? { id, name, items } : { name, items };

  it("replaces the saved outfits, in the order given", async () => {
    const { outfits } = await saveOutfits(deps, max, {
      outfits: [outfit("Rainy", ["rainhat", "bell"]), outfit("Plain", [])],
    });

    expect(outfits.map((o) => [o.name, o.items])).toEqual([
      ["Rainy", ["rainhat", "bell"]],
      ["Plain", []],
    ]);
    const rows = await outfitsOf(world.max.id);
    expect(rows.map((r) => [r.id, r.name, r.position])).toEqual([
      [outfits[0].id, "Rainy", 0],
      [outfits[1].id, "Plain", 1],
    ]);
  });

  it("keeps the id of an outfit that is saved again and drops the ones left out", async () => {
    const [everyday] = await outfitsOf(world.max.id);
    const { outfits } = await saveOutfits(deps, max, {
      outfits: [
        outfit("New", ["goggles"]),
        outfit("Daily", ["bow"], everyday.id),
      ],
    });

    expect(outfits[1]).toEqual({
      id: everyday.id,
      name: "Daily",
      items: ["bow"],
    });
    expect((await outfitsOf(world.max.id)).map((r) => r.id)).toEqual(
      outfits.map((o) => o.id),
    );
  });

  it("gives the same rows when the same save runs twice", async () => {
    const [everyday] = await outfitsOf(world.max.id);
    const input = {
      outfits: [outfit("Daily", ["bow"], everyday.id), outfit("Cap", ["cap"])],
    };
    const first = await saveOutfits(deps, max, input);
    const again = {
      outfits: first.outfits.map((o) => outfit(o.name, o.items, o.id)),
    };
    const second = await saveOutfits(deps, max, again);

    expect(second.outfits).toEqual(first.outfits);
    expect(await outfitsOf(world.max.id)).toHaveLength(2);
  });

  it("allows items the user does not own yet", async () => {
    const { outfits } = await saveOutfits(deps, max, {
      outfits: [outfit("Wish", ["party", "bandana", "booties"])],
    });
    expect(outfits[0].items).toEqual(["party", "bandana", "booties"]);
  });

  it("refuses a seventh outfit and leaves the saved ones as they were", async () => {
    const before = await outfitsOf(world.max.id);
    await expect(
      saveOutfits(deps, max, {
        outfits: Array.from({ length: 7 }, (_, i) => outfit(`O${i}`, [])),
      }),
    ).rejects.toMatchObject({ code: "invalid" });
    expect(await outfitsOf(world.max.id)).toEqual(before);
  });

  it.each([
    ["two items on one slot", ["goggles", "beanie"]],
    ["an unknown item", ["jetpack"]],
    ["the same item twice", ["bow", "bow"]],
  ])("refuses %s", async (_, items) => {
    const before = await outfitsOf(world.max.id);
    await expect(
      saveOutfits(deps, max, { outfits: [outfit("Bad", items)] }),
    ).rejects.toMatchObject({ code: "invalid" });
    expect(await outfitsOf(world.max.id)).toEqual(before);
  });

  it("refuses the same outfit id twice in one list", async () => {
    const before = await outfitsOf(world.max.id);
    const [everyday] = before;
    await expect(
      saveOutfits(deps, max, {
        outfits: [
          outfit("A", [], everyday.id),
          outfit("B", ["bow"], everyday.id),
        ],
      }),
    ).rejects.toMatchObject({ code: "invalid" });
    expect(await outfitsOf(world.max.id)).toEqual(before);
  });

  it("answers not_found for another user's outfit id and leaves theirs unchanged", async () => {
    const before = await outfitsOf(world.max.id);
    const [theirs] = await outfitsOf(world.priya.id);

    await expect(
      saveOutfits(deps, max, {
        outfits: [outfit("Mine now", ["goggles"], theirs.id)],
      }),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(await outfitsOf(world.priya.id)).toEqual([theirs]);
    expect(await outfitsOf(world.max.id)).toEqual(before);
  });
});
