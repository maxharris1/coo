import { beforeEach, expect, it } from "vitest";
import { putGear as clientPutGear } from "@/app/(app)/birds/[id]/closet/wear";
import type { OnboardedCaller, Profile } from "@/server/auth";
import type { UserId } from "@/server/ports/auth";
import type { Outfit } from "@/server/rows";
import { putGear, saveOutfits } from "@/server/services/gear";
import { sync } from "@/server/services/sync";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { seedWorld } from "@/test/seedWorld";

let deps: TestDeps;
let caller: OnboardedCaller;
let target: string;
let other: string;
let outfit: Outfit;

beforeEach(async () => {
  deps = await makeTestDeps();
  const world = await seedWorld(deps.db, deps.clock.now());
  const [profile] = await deps.db.query<Profile & { onboarded_at: Date }>(
    "select * from profiles where id = $1",
    [world.max.id],
  );
  caller = { userId: world.max.id as UserId, profile };
  [target, other] = world.max.birds.map((b) => b.id);
  await deps.db.query(
    "insert into gear_owned (user_id, gear_id) select $1, unnest($2::text[])",
    [world.max.id, ["beanie", "scarf"]],
  );
  await putGear(deps, caller, other, { items: ["scarf"] });
  [outfit] = (
    await saveOutfits(deps, caller, {
      outfits: [{ name: "Cosy", items: ["beanie", "scarf"] }],
    })
  ).outfits;
  await sync(deps, caller, null);
});

const serverFetch = async (_url: string, init?: RequestInit) => {
  try {
    const input = JSON.parse(String(init?.body));
    return Response.json(await putGear(deps, caller, target, input));
  } catch (error) {
    return Response.json(
      { error: { message: (error as Error).message } },
      { status: 409 },
    );
  }
};

const gearOf = async (id: string) =>
  (
    await deps.db.query<{ gear: string[] }>(
      "select gear from birds where id = $1",
      [id],
    )
  )[0].gear;

it("applies the whole outfit when a wearer leaves after sync", async () => {
  await deps.db.query("update birds set status = 'flying' where id = $1", [
    other,
  ]);

  const { skipped } = await clientPutGear(
    target,
    { outfitId: outfit.id },
    serverFetch,
  );

  expect(await gearOf(target)).toEqual(["beanie", "scarf"]);
  expect(skipped).toEqual([]);
  expect(await gearOf(other)).toEqual(["scarf"]);
});

it("leaves the item on a wearer who stays home", async () => {
  const { skipped } = await clientPutGear(
    target,
    { outfitId: outfit.id },
    serverFetch,
  );

  expect(await gearOf(target)).toEqual(["beanie", "scarf"]);
  expect(skipped).toEqual([]);
  expect(await gearOf(other)).toEqual(["scarf"]);
});
