import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserId } from "@/server/ports/auth";
import { createGuestLink } from "@/server/services/guestLinks/create";
import { searchPlaces } from "@/server/services/places";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { setShots, shotsOf } from "@/test/fixtures/espresso";
import { FakeClock } from "@/test/fakes/clock";
import { seedWorld, type World } from "@/test/seedWorld";
import { espressoUntil } from "./espresso";
import type { GuestSendResult } from "./guestSend";
import { send, type SendInput } from "./send";

vi.mock("@/env", () => ({
  getEnv: () => ({ LINK_TOKEN_PEPPER: "test-pepper" }),
}));

const BODY = "Come see the new loft";
const WILLIAMSBURG_ROOST = { lat: 40.708, lon: -73.9575 };
const WILLIAMSBURG_RAW = { lat: 40.7081, lon: -73.9571 };

let deps: TestDeps;
let world: World;
let max: UserId;
let priya: UserId;
let gerald: string;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
  max = world.max.id as UserId;
  priya = world.priya.id as UserId;
  gerald = world.max.birds[0].id;
});

async function heldPlace(user: UserId, q = "Williamsburg"): Promise<string> {
  const { results } = await searchPlaces(deps, user, q);
  return results[0].placeId;
}

function guestInput(placeId: string, birdId = gerald, name = "Sam"): SendInput {
  return { body: BODY, sends: [{ guest: { name, placeId }, birdId }] };
}

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as { code: string }).code;
  }
  return "resolved";
}

async function counts() {
  const [row] = await deps.db.query<{
    away_birds: number;
    notes: number;
    flights: number;
    guest_links: number;
    notifications: number;
  }>(
    `select (select count(*)::int from birds where status <> 'home') as away_birds,
       (select count(*)::int from notes) as notes,
       (select count(*)::int from flights) as flights,
       (select count(*)::int from guest_links) as guest_links,
       (select count(*)::int from notifications) as notifications`,
  );
  return row;
}

describe("guestSend", () => {
  it("stores the snapped place as the destination of the link and the flight (ac-3)", async () => {
    const before = await counts();
    const placeId = await heldPlace(max);

    const result = (await send(
      deps,
      max,
      guestInput(placeId),
    )) as GuestSendResult;

    const [flight] = result.flights;
    expect(result.flights).toHaveLength(1);
    expect(result.guestLinks).toEqual([
      {
        flightId: flight.id,
        url: expect.stringMatching(
          /^https:\/\/coo-pigeon\.vercel\.app\/b\/gerald-[A-Za-z0-9]{16}$/,
        ),
      },
    ]);
    expect(flight).toMatchObject({ guestName: "Sam" });

    const [link] = await deps.db.query<{
      id: string;
      recipient_name: string;
      dest_lat: number;
      dest_lon: number;
      dest_label: string;
    }>(
      "select id, recipient_name, dest_lat, dest_lon, dest_label from guest_links where sender_id = $1",
      [max],
    );
    expect(link).toMatchObject({
      recipient_name: "Sam",
      dest_lat: WILLIAMSBURG_ROOST.lat,
      dest_lon: WILLIAMSBURG_ROOST.lon,
      dest_label: "Williamsburg",
    });

    const [stored] = await deps.db.query<{
      to_lat: number;
      to_lon: number;
      to_label: string;
      counterpart_id: string | null;
      guest_link_id: string;
      status: string;
      note_recipient: string | null;
      note_link: string;
    }>(
      `select f.to_lat, f.to_lon, f.to_label, f.counterpart_id, f.guest_link_id,
         f.status, n.recipient_id as note_recipient, n.guest_link_id as note_link
       from flights f join notes n on n.id = f.note_id where f.id = $1`,
      [flight.id],
    );
    expect(stored).toEqual({
      to_lat: WILLIAMSBURG_ROOST.lat,
      to_lon: WILLIAMSBURG_ROOST.lon,
      to_label: "Williamsburg",
      counterpart_id: null,
      guest_link_id: link.id,
      status: "flying",
      note_recipient: null,
      note_link: link.id,
    });
    expect([stored.to_lat, stored.to_lon]).not.toEqual([
      WILLIAMSBURG_RAW.lat,
      WILLIAMSBURG_RAW.lon,
    ]);

    expect(await counts()).toEqual({
      ...before,
      away_birds: before.away_birds + 1,
      notes: before.notes + 1,
      flights: before.flights + 1,
      guest_links: before.guest_links + 1,
    });
  });

  it("refuses the 6th guest link of the day as rate_limited and writes nothing", async () => {
    const placeId = await heldPlace(max);
    for (let i = 0; i < deps.config.game.guestLinks.perDay; i++)
      await deps.db.tx((tx) =>
        createGuestLink(deps, tx, "test-pepper", {
          senderId: max,
          recipientName: "Earlier",
          dest: { point: WILLIAMSBURG_ROOST, label: "Williamsburg" },
          birdName: "Brenda",
          timezone: "America/New_York",
          now: deps.clock.now(),
        }),
      );
    const before = await counts();

    expect(await refusal(send(deps, max, guestInput(placeId)))).toBe(
      "rate_limited",
    );
    expect(await counts()).toEqual(before);
  });

  async function reportedLinks(
    sender: UserId,
    n: number,
    daysAgo: number,
  ): Promise<void> {
    const at = deps.clock.now() - daysAgo * 24 * 60 * 60 * 1000;
    for (let i = 0; i < n; i++)
      await deps.db.tx(async (tx) => {
        const link = await createGuestLink(deps, tx, "test-pepper", {
          senderId: sender,
          recipientName: "Earlier",
          dest: { point: WILLIAMSBURG_ROOST, label: "Williamsburg" },
          birdName: "Brenda",
          timezone: "America/New_York",
          now: at - i * 60_000,
        });
        await tx.query(
          "update guest_links set status = 'reported' where id = $1",
          [link.id],
        );
        await tx.query(
          `insert into reports (reporter_id, guest_link_id, reason, created_at)
           values (null, $1, 'spam', $2)`,
          [link.id, new Date(at).toISOString()],
        );
      });
  }

  it("refuses a sender with three reported links in 30 days as forbidden and writes nothing (ac-5)", async () => {
    const placeId = await heldPlace(max);
    await reportedLinks(max, 3, 29);
    const before = await counts();

    expect(await refusal(send(deps, max, guestInput(placeId)))).toBe(
      "forbidden",
    );
    expect(await counts()).toEqual(before);
  });

  it("still lets a sender with two reported links in 30 days send", async () => {
    const placeId = await heldPlace(max);
    await reportedLinks(max, 2, 1);

    expect(await refusal(send(deps, max, guestInput(placeId)))).toBe(
      "resolved",
    );
  });

  it("ignores reports older than 30 days", async () => {
    const placeId = await heldPlace(max);
    await reportedLinks(max, 3, 31);

    expect(await refusal(send(deps, max, guestInput(placeId)))).toBe(
      "resolved",
    );
  });

  it("does not hold another sender's reported links against me", async () => {
    const placeId = await heldPlace(max);
    await reportedLinks(priya, 3, 1);

    expect(await refusal(send(deps, max, guestInput(placeId)))).toBe(
      "resolved",
    );
  });

  it("still lets a sender with three reported links send to a friend", async () => {
    await reportedLinks(max, 3, 1);

    expect(
      await refusal(
        send(deps, max, {
          body: BODY,
          sends: [{ friendId: priya, birdId: gerald }],
        }),
      ),
    ).toBe("resolved");
  });

  it("refuses someone else's place as invalid", async () => {
    const placeId = await heldPlace(priya);
    const before = await counts();

    expect(await refusal(send(deps, max, guestInput(placeId)))).toBe("invalid");
    expect(await counts()).toEqual(before);
  });

  it("refuses someone else's bird as not_found", async () => {
    const placeId = await heldPlace(max);
    const before = await counts();

    expect(
      await refusal(
        send(deps, max, guestInput(placeId, world.priya.birds[0].id)),
      ),
    ).toBe("not_found");
    expect(await counts()).toEqual(before);
  });

  it.each(["", "   ", "x".repeat(31)])(
    "refuses the guest name %j as invalid",
    async (name) => {
      const placeId = await heldPlace(max);
      const before = await counts();

      expect(
        await refusal(send(deps, max, guestInput(placeId, gerald, name))),
      ).toBe("invalid");
      expect(await counts()).toEqual(before);
    },
  );

  it("refuses a guest send mixed with another send as invalid", async () => {
    const placeId = await heldPlace(max);
    const before = await counts();

    expect(
      await refusal(
        send(deps, max, {
          body: BODY,
          sends: [
            { guest: { name: "Sam", placeId }, birdId: gerald },
            { friendId: priya, birdId: world.max.birds[1].id },
          ],
        }),
      ),
    ).toBe("invalid");
    expect(await counts()).toEqual(before);
  });

  it("spends a shot and flies through the first night with espresso", async () => {
    const tenPm = Date.UTC(2026, 10, 20, 3);
    deps = await makeTestDeps({ clock: new FakeClock(tenPm) });
    world = await seedWorld(deps.db, tenPm);
    await setShots(deps.db, max, 1);
    const placeId = await heldPlace(max);

    const { flights } = await send(deps, max, {
      body: BODY,
      sends: [
        { guest: { name: "Sam", placeId }, birdId: gerald, espresso: true },
      ],
    });

    expect(await shotsOf(deps.db, max)).toBe(0);
    const [{ input }] = await deps.db.query<{
      input: Parameters<typeof espressoUntil>[0];
    }>("select input from flights where id = $1", [flights[0].id]);
    expect(input.nightFlightUntilMs).toBeGreaterThan(tenPm);
    expect(input.nightFlightUntilMs).toBe(espressoUntil(input));
  });
});
