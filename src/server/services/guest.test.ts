import { beforeEach, describe, expect, it, vi } from "vitest";
import { guestGet } from "@/app/api/guest/[token]/get";
import type { UserId } from "@/server/ports/auth";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { geoClient } from "@/test/geoRoute";
import { seedWorld, type World } from "@/test/seedWorld";
import type { GuestSendResult } from "./flights/guestSend";
import { send } from "./flights/send";
import { searchPlaces } from "./places";
import { tick } from "./tick";

vi.mock("@/env", () => ({
  getEnv: () => ({ LINK_TOKEN_PEPPER: PEPPER }),
}));

const PEPPER = "test-pepper";
const NOTE = "Come see the new loft on Saturday";
const MINUTE_MS = 60_000;

let deps: TestDeps;
let world: World;
let max: UserId;
let gerald: string;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
  max = world.max.id as UserId;
  gerald = world.max.birds[0].id;
});

function publicGet(path: string) {
  return geoClient(deps, (r) => guestGet(r, () => PEPPER), path).get({});
}

function withoutServerNow(json: Record<string, unknown>) {
  const { serverNow, ...rest } = json;
  expect(typeof serverNow).toBe("number");
  return rest;
}

describe("scenario 6: guest (public parts)", () => {
  it("a stranger follows Max's link, sees Gerald flying but not the note, then reads it after landing", async () => {
    const { results } = await searchPlaces(deps, max, "Williamsburg");
    const result = (await send(deps, max, {
      body: NOTE,
      sends: [
        { guest: { name: "Sam", placeId: results[0].placeId }, birdId: gerald },
      ],
    })) as GuestSendResult;
    const [{ flightId, url }] = result.guestLinks;
    const token = url.slice(url.lastIndexOf("-") + 1);
    const arriveAt = result.flights[0].arriveAt as number;

    const links = await deps.db.query<{ id: string; token_hash: string }>(
      "select id, token_hash from guest_links",
    );
    expect(links).toHaveLength(1);
    expect(links[0].token_hash).not.toContain(token);
    const [flight] = await deps.db.query<{ guest_link_id: string }>(
      "select guest_link_id from flights where id = $1",
      [flightId],
    );
    expect(flight.guest_link_id).toBe(links[0].id);

    const flying = await publicGet(`/api/guest/${token}`);
    expect(flying.status).toBe(200);
    expect(flying.json).not.toHaveProperty("note");
    expect(JSON.stringify(flying.json)).not.toContain(NOTE);
    expect(flying.json).toMatchObject({
      senderName: "Max",
      recipientName: "Sam",
      flight: { status: "flying" },
    });

    const wrong = await publicGet("/api/guest/AAAAAAAAAAAAAAAA");
    const missing = await publicGet("/api/guest/");
    expect(wrong.status).toBe(404);
    expect(wrong.json.error.code).toBe("not_found");
    expect(missing.status).toBe(404);
    expect(withoutServerNow(missing.json)).toEqual(
      withoutServerNow(wrong.json),
    );

    deps.clock.set(arriveAt + MINUTE_MS);
    await tick(deps);

    const landed = await publicGet(`/api/guest/${token}`);
    expect(landed.status).toBe(200);
    expect(landed.json).toMatchObject({
      flight: { status: "landed" },
      note: { body: NOTE },
    });
  });
});
