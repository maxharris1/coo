import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import { computeFlightPlan, type FlightInput } from "@/lib/flight/engine";
import { rollHatchling } from "@/lib/game/eggs";
import { validateBody } from "@/lib/game/notes";
import type { BreedId } from "@/lib/game/types";
import type { OnboardedCaller, Profile } from "@/server/auth";
import type { UserId } from "@/server/ports/auth";
import { toBirdRecord, type Row } from "@/server/rows";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { seedWorld, type World } from "@/test/seedWorld";
import { hatch } from "./eggs";
import { quoteInput } from "./flights/quote";

let deps: TestDeps;
let world: World;
let max: OnboardedCaller;

async function callerFor(id: string): Promise<OnboardedCaller> {
  const [profile] = await deps.db.query<Profile & { onboarded_at: Date }>(
    "select * from profiles where id = $1",
    [id],
  );
  return { userId: id as UserId, profile };
}

function eggIdFor(breed: BreedId, owned: BreedId[]): string {
  for (let i = 1; i < 10_000; i++) {
    const id = `00000000-0000-4000-a000-${String(i).padStart(12, "0")}`;
    if (rollHatchling(id, owned).breed === breed) return id;
  }
  throw new Error(`no egg id rolls ${breed}`);
}

async function layEgg(
  userId: string,
  { id, status = "ready" }: { id?: string; status?: string } = {},
): Promise<string> {
  const [row] = await deps.db.query<{ id: string }>(
    `insert into eggs (id, user_id, hatch_at_delivery, status)
     values (coalesce($1::uuid, gen_random_uuid()), $2, $3, $4) returning id`,
    [id ?? null, userId, config.game.eggs.firstAtDeliveries, status],
  );
  return row.id;
}

async function eggsOf(userId: string) {
  return deps.db.query<Row<"eggs">>(
    "select * from eggs where user_id = $1 order by hatch_at_delivery",
    [userId],
  );
}

async function birdsOf(userId: string) {
  return deps.db.query<Row<"birds">>(
    "select * from birds where owner_id = $1 order by hatched_at, id",
    [userId],
  );
}

async function addBird(userId: string, breed: BreedId) {
  await deps.db.query(
    `insert into birds (owner_id, name, breed, speed_mph, focus, navigation)
     values ($1, 'Extra', $2, 45, 3, 3)`,
    [userId, breed],
  );
}

async function setBreeds(userId: string, breeds: BreedId[]) {
  const birds = await birdsOf(userId);
  for (const [i, breed] of breeds.entries()) {
    if (birds[i]) {
      await deps.db.query("update birds set breed = $2 where id = $1", [
        birds[i].id,
        breed,
      ]);
    } else {
      await addBird(userId, breed);
    }
  }
}

const name = { name: "Pretzel", pronoun: "she" };

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
  max = await callerFor(world.max.id);
});

describe("hatch", () => {
  it("stores the rolled hatchling, marks the egg hatched and lays the next egg 25 deliveries on", async () => {
    await deps.db.query(
      "update profiles set deliveries_count = 7 where id = $1",
      [world.max.id],
    );
    const eggId = await layEgg(world.max.id);

    const bird = await hatch(deps, max, { eggId, ...name });

    const rolled = rollHatchling(eggId, ["city"]);
    const birds = await birdsOf(world.max.id);
    expect(birds).toHaveLength(3);
    const row = birds.find((b) => b.id === bird.id)!;
    expect({
      breed: row.breed,
      look: row.look,
      speedMph: Number(row.speed_mph),
      focus: row.focus,
      navigation: row.navigation,
      quirks: row.quirks,
    }).toEqual(rolled);
    expect(row).toMatchObject({ name: "Pretzel", pronoun: "she" });
    expect(bird).toMatchObject({ id: row.id, name: "Pretzel", ...rolled });

    const [hatched, next] = await eggsOf(world.max.id);
    expect(hatched).toMatchObject({
      id: eggId,
      status: "hatched",
      bird_id: bird.id,
    });
    expect(hatched.hatched_at).not.toBeNull();
    expect(next).toMatchObject({
      status: "incubating",
      hatch_at_delivery: 7 + config.game.eggs.everyDeliveries,
      bird_id: null,
    });
  });

  it("returns the same bird when the hatch is repeated", async () => {
    const eggId = await layEgg(world.max.id);

    const first = await hatch(deps, max, { eggId, ...name });
    const again = await hatch(deps, max, { eggId, ...name });
    const [a, b] = await Promise.all([
      hatch(deps, max, { eggId, ...name }),
      hatch(deps, max, { eggId, ...name }),
    ]);

    expect([again.id, a.id, b.id]).toEqual([first.id, first.id, first.id]);
    expect(await birdsOf(world.max.id)).toHaveLength(3);
    expect(await eggsOf(world.max.id)).toHaveLength(2);
  });

  it("refuses an egg that is still incubating", async () => {
    const eggId = await layEgg(world.max.id, { status: "incubating" });

    await expect(hatch(deps, max, { eggId, ...name })).rejects.toMatchObject({
      code: "conflict",
    });
    expect(await birdsOf(world.max.id)).toHaveLength(2);
    expect((await eggsOf(world.max.id))[0].status).toBe("incubating");
  });

  it("refuses when every perch is taken and leaves the egg ready", async () => {
    await addBird(world.max.id, "city");
    const eggId = await layEgg(world.max.id);

    await expect(hatch(deps, max, { eggId, ...name })).rejects.toMatchObject({
      code: "conflict",
    });
    expect(await birdsOf(world.max.id)).toHaveLength(3);
    expect(await eggsOf(world.max.id)).toMatchObject([{ status: "ready" }]);
  });

  it("hatches a breed the user does not own, with abilities inside its ranges", async () => {
    const owned: BreedId[] = ["fantail", "pouter", "frillback", "jacobin"];
    await deps.db.query("update profiles set perches = 5 where id = $1", [
      world.max.id,
    ]);
    await setBreeds(world.max.id, owned);
    const eggId = await layEgg(world.max.id);

    const bird = await hatch(deps, max, { eggId, ...name });

    expect(["king", "tumbler"]).toContain(bird.breed);
    expect(bird).toMatchObject(rollHatchling(eggId, owned));
    const ranges = config.breeds.breeds.find((b) => b.id === bird.breed)!;
    for (const stat of ["speedMph", "focus", "navigation"] as const) {
      expect(bird[stat]).toBeGreaterThanOrEqual(ranges[stat][0]);
      expect(bird[stat]).toBeLessThanOrEqual(ranges[stat][1]);
    }
  });

  it("stores a Jacobin's focus as 5", async () => {
    const eggId = await layEgg(world.max.id, {
      id: eggIdFor("jacobin", ["city"]),
    });

    const bird = await hatch(deps, max, { eggId, ...name });

    const row = (await birdsOf(world.max.id)).find((b) => b.id === bird.id)!;
    expect(row).toMatchObject({ breed: "jacobin", focus: 5 });
  });

  it("flies a hatched King later into dusk than a city pigeon on the king-twilight route", async () => {
    const eggId = await layEgg(world.max.id, {
      id: eggIdFor("king", ["city"]),
    });
    const bird = await hatch(deps, max, { eggId, ...name });
    const [row] = await deps.db.query<Row<"birds">>(
      "select * from birds where id = $1",
      [bird.id],
    );
    const route = kingTwilight();

    const input = quoteInput(
      toBirdRecord(row),
      { hasBirdbath: false },
      route.from,
      route.to,
      route.departAtMs,
      route.weather,
      { hawk: false, fair: false },
    );
    const asCity = { ...input, bird: { ...input.bird, breed: "city" } };

    expect(input.bird.breed).toBe("king");
    expect(firstRoostMs(input)).toBeGreaterThan(firstRoostMs(asCity));
  });

  it("gives a hatched Pouter a 280 character note limit", async () => {
    const eggId = await layEgg(world.max.id, {
      id: eggIdFor("pouter", ["city"]),
    });

    const bird = await hatch(deps, max, { eggId, ...name });

    expect(bird).toMatchObject({ breed: "pouter", noteLimit: 280 });
    expect(validateBody("a".repeat(280), bird.noteLimit)).toMatchObject({
      ok: true,
      length: 280,
    });
    expect(validateBody("a".repeat(281), bird.noteLimit).ok).toBe(false);
  });

  it("does not let another user hatch someone else's egg", async () => {
    const eggId = await layEgg(world.max.id);
    const priya = await callerFor(world.priya.id);

    await expect(hatch(deps, priya, { eggId, ...name })).rejects.toMatchObject({
      code: "not_found",
    });
    expect(await eggsOf(world.max.id)).toMatchObject([{ status: "ready" }]);
    expect(await birdsOf(world.priya.id)).toHaveLength(2);
  });

  it("rejects a missing name or an unknown pronoun", async () => {
    const eggId = await layEgg(world.max.id);

    for (const input of [
      { eggId, pronoun: "she" },
      { eggId, name: "Pretzel", pronoun: "it" },
      { name: "Pretzel", pronoun: "she" },
    ]) {
      await expect(hatch(deps, max, input)).rejects.toMatchObject({
        code: "invalid",
      });
    }
    expect(await birdsOf(world.max.id)).toHaveLength(2);
  });
});

type Vector = { name: string; input: FlightInput };

function kingTwilight() {
  const file = fileURLToPath(
    new URL("../../../reference/flight-engine/vectors.json", import.meta.url),
  );
  const { vectors } = JSON.parse(readFileSync(file, "utf8")) as {
    vectors: Vector[];
  };
  const { input } = vectors.find((v) => v.name === "king-twilight")!;
  return {
    ...input,
    weather: input.weather as Parameters<typeof quoteInput>[5],
  };
}

function firstRoostMs(input: FlightInput): number {
  const roost = computeFlightPlan(input).segments.find(
    (s) => s.kind === "roost",
  );
  if (!roost) throw new Error("the route never roosts");
  return roost.startMs;
}
