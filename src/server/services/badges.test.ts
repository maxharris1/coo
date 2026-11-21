import { beforeEach, describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { seedWorld, type World } from "@/test/seedWorld";
import { badgeRules, type BadgeEvent } from "./badges";

let deps: TestDeps;
let world: World;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
});

async function badgeRows() {
  const [{ n }] = await deps.db.query<{ n: number }>(
    "select count(*)::int as n from badges",
  );
  return n;
}

describe("badgeRules", () => {
  it("has one rule per badge in config", () => {
    expect(Object.keys(badgeRules).sort()).toEqual(
      config.badges.badges.map((b) => b.id).sort(),
    );
  });

  it("a rule ignores an event for a flight that does not exist", async () => {
    const before = await badgeRows();
    const events: BadgeEvent[] = [
      {
        kind: "delivery-landed",
        flightId: crypto.randomUUID(),
        ownerId: world.max.id,
      },
      {
        kind: "return-landed",
        flightId: crypto.randomUUID(),
        ownerId: world.max.id,
      },
    ];
    for (const rule of Object.values(badgeRules))
      for (const event of events) await rule.apply(deps.db, event);

    expect(await badgeRows()).toBe(before);
  });
});
