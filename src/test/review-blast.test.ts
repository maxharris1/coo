import { expect, test } from "vitest";
import { toE164 } from "@/lib/phone";
import { flockRow, incomingCards } from "@/app/(app)/flockRows";
import { requireOnboarded } from "@/server/auth";
import { sync } from "@/server/services/sync";
import { makeTestDeps } from "./deps";
import { FakeJar } from "./fakes/jar";
import { seedWorld } from "./seedWorld";
import { insertFlyingDelivery } from "./fixtures/flights";

test("full sync must not produce a false incoming card at the departure loft", async () => {
  const deps = await makeTestDeps();
  const world = await seedWorld(deps.db, deps.clock.now());
  const { flightId } = await insertFlyingDelivery(
    deps.db,
    world,
    deps.clock.now(),
  );
  await deps.db.query(
    `update flights set kind = 'return', note_id = null,
    from_lat = to_lat, from_lon = to_lon, from_label = to_label,
    to_lat = from_lat, to_lon = from_lon, to_label = from_label where id = $1`,
    [flightId],
  );
  const phone = toE164("+15550000002");
  if (!phone) throw new Error("synthetic phone invalid");
  const auth = deps.auth(new FakeJar());
  await auth.verifyCode(phone, "000000");
  const caller = await requireOnboarded({ auth, db: deps.db });
  const payload = await sync(deps, caller, null);
  expect(payload.flights).toHaveLength(1);
  expect(payload.flights[0].to.label).toBe("East Village");
  expect(payload.flights[0].from.label).toBe("Center City");
  const cards = incomingCards(
    JSON.parse(JSON.stringify(payload.flights)),
    deps.clock.now(),
  );
  expect(cards).toEqual([]);
});

test("the owner sees their returning bird in the flock, not as an incoming card", async () => {
  const deps = await makeTestDeps();
  const world = await seedWorld(deps.db, deps.clock.now());
  const { flightId, birdId } = await insertFlyingDelivery(
    deps.db,
    world,
    deps.clock.now(),
  );
  await deps.db.query(
    `update flights set kind = 'return', note_id = null,
      from_lat = to_lat, from_lon = to_lon, from_label = to_label,
      to_lat = from_lat, to_lon = from_lon, to_label = from_label where id = $1`,
    [flightId],
  );
  const phone = toE164("+15550000001");
  if (!phone) throw new Error("synthetic phone invalid");
  const auth = deps.auth(new FakeJar());
  await auth.verifyCode(phone, "000000");
  const caller = await requireOnboarded({ auth, db: deps.db });
  expect(caller.userId).toBe(world.max.id);

  const payload = await sync(deps, caller, null);
  expect(payload.flights).toHaveLength(1);
  expect(payload.flights[0]).toMatchObject({
    role: "mine",
    kind: "return",
    to: { label: "East Village" },
  });

  const flights = JSON.parse(JSON.stringify(payload.flights));
  expect(incomingCards(flights, deps.clock.now())).toEqual([]);

  const bird = payload.birds.find((b) => b.id === birdId);
  expect(bird?.status).toBe("flying");
  if (!bird) throw new Error("returning bird missing from payload");
  const row = flockRow(bird, {
    timezone: payload.me.timezone,
    nowMs: deps.clock.now(),
    flights,
    myVisiting: JSON.parse(JSON.stringify(payload.myVisiting)),
  });
  expect(row).toEqual({
    action: { kind: "chip", chip: "Flying" },
    line: expect.stringMatching(/^Heading home, lands /),
    tone: "sun",
  });
});
