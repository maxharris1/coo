import { beforeAll, describe, expect, it } from "vitest";
import type { Db } from "@/server/db";
import { config } from "@/lib/config";
import { haversineMi } from "@/lib/flight/engine";
import { testDb } from "./testDb";
import { pair, seedWorld, type World } from "./seedWorld";

type ProfileRow = {
  id: string;
  name: string;
  handle: string;
  seeds: number;
  perches: number;
  home_lat: number;
  home_lon: number;
  home_label: string;
  home_city: string;
  onboarded_at: Date;
};
type BirdRow = {
  owner_id: string;
  name: string;
  look: string;
  speed_mph: number;
  focus: number;
  navigation: number;
  belly: number;
  feathers: number;
  energy: number;
  care_at: Date;
  last_fed_at: Date;
  hatched_at: Date;
  status: string;
};
type FriendshipRow = { a_id: string; b_id: string; status: string };

const NOW = Date.UTC(2026, 10, 19, 15, 0, 0);
const { start, roost } = config.game;

function onGrid(value: number, step: number): boolean {
  const cells = value / step;
  return Math.abs(cells - Math.round(cells)) < 1e-6;
}

describe("seedWorld", () => {
  let db: Db;
  let world: World;
  let profiles: Map<string, ProfileRow>;

  beforeAll(async () => {
    db = await testDb();
    world = await seedWorld(db, NOW);
    const rows = await db.query<ProfileRow>("select * from profiles");
    profiles = new Map(rows.map((r) => [r.id, r]));
  });

  const people = () => [world.max, world.priya, world.rosa];
  const loft = (id: string) => {
    const p = profiles.get(id)!;
    return { lat: p.home_lat, lon: p.home_lon };
  };

  it("stores Max, Priya and Rosa with ids ordered max < priya < rosa", () => {
    expect(profiles.size).toBe(3);
    expect(people().map((p) => profiles.get(p.id)?.name)).toEqual([
      "Max",
      "Priya",
      "Rosa",
    ]);
    expect(people().map((p) => profiles.get(p.id)?.handle)).toEqual([
      "max",
      "priya",
      "rosa",
    ]);
    expect(world.max.id < world.priya.id).toBe(true);
    expect(world.priya.id < world.rosa.id).toBe(true);
  });

  it("gives each person a loft on the roost grid, onboarded at nowMs", () => {
    expect(
      people().map((p) => [
        profiles.get(p.id)?.home_label,
        profiles.get(p.id)?.home_city,
      ]),
    ).toEqual([
      ["East Village", "New York"],
      ["Center City", "Philadelphia"],
      ["Williamsburg", "New York"],
    ]);
    for (const p of profiles.values()) {
      expect(onGrid(p.home_lat, roost.gridLatDeg)).toBe(true);
      expect(onGrid(p.home_lon, roost.gridLonDeg)).toBe(true);
      expect(p.onboarded_at.getTime()).toBe(NOW);
    }
  });

  it("puts Priya 82 miles from Max and Rosa 2 miles from Max", () => {
    expect(haversineMi(loft(world.max.id), loft(world.priya.id))).toBeCloseTo(
      82.1,
      0,
    );
    expect(
      Math.abs(haversineMi(loft(world.max.id), loft(world.rosa.id)) - 2.2),
    ).toBeLessThan(0.3);
  });

  it("pays the starting seeds through the ledger", async () => {
    const ledger = await db.query<{ user_id: string; total: number }>(
      "select user_id, sum(delta)::int as total from seed_ledger group by user_id",
    );
    expect(ledger).toHaveLength(3);
    for (const { user_id, total } of ledger) {
      expect(total).toBe(start.seeds);
      expect(profiles.get(user_id)?.seeds).toBe(start.seeds);
    }
  });

  it("gives each person the two starter birds, cared for at nowMs", async () => {
    const birds = await db.query<BirdRow>(
      "select * from birds order by owner_id, hatched_at, name",
    );
    expect(birds).toHaveLength(6);
    for (const p of people()) {
      const own = birds.filter((b) => b.owner_id === p.id);
      expect(own.map((b) => b.name).sort()).toEqual(
        p.birds.map((b) => b.name).sort(),
      );
      expect(
        own
          .map((b) => ({
            speedMph: b.speed_mph,
            focus: b.focus,
            navigation: b.navigation,
          }))
          .sort((x, y) => x.speedMph - y.speedMph),
      ).toEqual(start.birds);
    }
    for (const b of birds) {
      expect(start.looks).toContain(b.look);
      expect({
        belly: b.belly,
        feathers: b.feathers,
        energy: b.energy,
      }).toEqual(start.care);
      expect(b.status).toBe("home");
      expect(
        [b.care_at, b.last_fed_at, b.hatched_at].map((d) => d.getTime()),
      ).toEqual([NOW, NOW, NOW]);
    }
    const [gerald] = await db.query<BirdRow>(
      "select * from birds where owner_id = $1 and name = 'Gerald'",
      [world.max.id],
    );
    expect(gerald).toMatchObject({
      speed_mph: 45,
      focus: 2,
      navigation: 4,
      look: "gerald",
    });
    expect(world.max.birds[0]).toEqual({
      id: expect.any(String),
      name: "Gerald",
    });
  });

  it("fills each closet with the starter gear and one outfit", async () => {
    for (const p of people()) {
      const gear = await db.query<{ gear_id: string }>(
        "select gear_id from gear_owned where user_id = $1 order by gear_id",
        [p.id],
      );
      expect(gear.map((g) => g.gear_id)).toEqual([...start.gear].sort());
      const outfits = await db.query<{ name: string; items: string[] }>(
        "select name, items from outfits where user_id = $1",
        [p.id],
      );
      expect(outfits).toEqual([{ name: "Everyday", items: [...start.gear] }]);
    }
  });

  it("makes Max friends with Priya and with Rosa, and Priya and Rosa strangers", async () => {
    const rows = await db.query<FriendshipRow>(
      "select a_id, b_id, status from friendships order by a_id, b_id",
    );
    const { max, priya, rosa } = world;
    expect(rows).toEqual(
      [pair(max.id, priya.id), pair(max.id, rosa.id)].map(([a_id, b_id]) => ({
        a_id,
        b_id,
        status: "accepted",
      })),
    );
    expect(rows).not.toContainEqual(
      expect.objectContaining({ a_id: priya.id, b_id: rosa.id }),
    );
  });

  it("pair orders two ids whichever way they come in", () => {
    expect(pair("b", "a")).toEqual(["a", "b"]);
    expect(pair("a", "b")).toEqual(["a", "b"]);
  });

  it("seeds a second fresh database the same way", async () => {
    const again = await seedWorld(await testDb(), NOW);
    expect(again).toEqual(world);
  });
});
