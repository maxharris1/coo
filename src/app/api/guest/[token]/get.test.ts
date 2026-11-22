import { beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "@/lib/config";
import type { UserId } from "@/server/ports/auth";
import type { GuestSendResult } from "@/server/services/flights/guestSend";
import { send } from "@/server/services/flights/send";
import { searchPlaces } from "@/server/services/places";
import { tick } from "@/server/services/tick";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { geoClient } from "@/test/geoRoute";
import { seedWorld, type World } from "@/test/seedWorld";
import { guestGet } from "./get";

vi.mock("@/env", () => ({
  getEnv: () => ({ LINK_TOKEN_PEPPER: PEPPER }),
}));

const PEPPER = "test-pepper";
const BODY = "Come see the new loft";
const MARKER = [
  [123, 45],
  [67, 89],
];
const DOODLE = {
  v: 1,
  w: config.game.notes.doodle.width,
  h: config.game.notes.doodle.height,
  strokes: [{ color: "ink", width: "marker", points: MARKER }],
};

let deps: TestDeps;
let world: World;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
});

function client(path: string) {
  return geoClient(deps, (r) => guestGet(r, () => PEPPER), path);
}

async function guestToken(doodle?: typeof DOODLE) {
  const max = world.max.id as UserId;
  const { results } = await searchPlaces(deps, max, "Williamsburg");
  const result = (await send(deps, max, {
    body: BODY,
    doodle,
    sends: [
      {
        guest: { name: "Sam", placeId: results[0].placeId },
        birdId: world.max.birds[0].id,
      },
    ],
  })) as GuestSendResult;
  const url = result.guestLinks[0].url;
  if (doodle) {
    deps.clock.set((result.flights[0].arriveAt as number) + 1000);
    await tick(deps);
  }
  return url.slice(url.lastIndexOf("-") + 1);
}

function withoutServerNow(json: Record<string, unknown>) {
  const { serverNow, ...rest } = json;
  expect(typeof serverNow).toBe("number");
  return rest;
}

describe("GET /api/guest/[token]", () => {
  it("shows the flight to someone with no session, without the note before landing", async () => {
    const token = await guestToken();

    const { status, json } = await client(`/api/guest/${token}`).get({});

    expect(status).toBe(200);
    expect(json).not.toHaveProperty("note");
    expect(JSON.stringify(json)).not.toContain(BODY);
    expect(json).toMatchObject({ senderName: "Max", recipientName: "Sam" });
  });

  it("answers a wrong token and a missing one with the same 404 (ac-2)", async () => {
    await guestToken();

    const wrong = await client("/api/guest/AAAAAAAAAAAAAAAA").get({});
    const missing = await client("/api/guest/").get({});
    const malformed = await client("/api/guest/%E0%A4%A").get({});

    expect(wrong.status).toBe(404);
    expect(wrong.json.error.code).toBe("not_found");
    expect(missing.status).toBe(404);
    expect(malformed.status).toBe(404);
    expect(withoutServerNow(missing.json)).toEqual(
      withoutServerNow(wrong.json),
    );
    expect(withoutServerNow(malformed.json)).toEqual(
      withoutServerNow(wrong.json),
    );
  });

  describe("a landed note with a doodle", () => {
    it("shows the doodle with the note while the link is live", async () => {
      const token = await guestToken(DOODLE);

      const { status, json } = await client(`/api/guest/${token}`).get({});

      expect(status).toBe(200);
      expect(json.note).toMatchObject({ body: BODY, doodle: DOODLE });
    });

    const past = () => new Date(deps.clock.now() - 1000).toISOString();

    it.each<[string, string, () => unknown[], number]>([
      ["reported", "status = 'reported'", () => [], 404],
      ["marked expired", "status = 'expired'", () => [], 410],
      ["past its expiry time", "expires_at = $1", () => [past()], 410],
    ])(
      "hides the note and doodle once the link is %s",
      async (_, set, params, code) => {
        const token = await guestToken(DOODLE);
        await deps.db.query(`update guest_links set ${set}`, params());

        const res = await client(`/api/guest/${token}`).get({});

        expect(res.status).toBe(code);
        const text = JSON.stringify(res.json);
        for (const secret of [BODY, "doodle", JSON.stringify(MARKER)]) {
          expect(text).not.toContain(secret);
        }
      },
    );
  });
});
