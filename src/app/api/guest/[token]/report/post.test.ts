import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserId } from "@/server/ports/auth";
import type { GuestSendResult } from "@/server/services/flights/guestSend";
import { send } from "@/server/services/flights/send";
import { searchPlaces } from "@/server/services/places";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { geoClient } from "@/test/geoRoute";
import { seedWorld, type World } from "@/test/seedWorld";
import { guestGet } from "../get";
import { guestReportPost } from "./post";

vi.mock("@/env", () => ({
  getEnv: () => ({ LINK_TOKEN_PEPPER: PEPPER }),
}));

const PEPPER = "test-pepper";

let deps: TestDeps;
let world: World;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
});

const view = (token: string) =>
  geoClient(deps, (r) => guestGet(r, () => PEPPER), `/api/guest/${token}`);
const reporter = (token: string) =>
  geoClient(
    deps,
    (r) => guestReportPost(r, () => PEPPER),
    `/api/guest/${token}/report`,
  );

async function guestToken() {
  const max = world.max.id as UserId;
  const { results } = await searchPlaces(deps, max, "Williamsburg");
  const result = (await send(deps, max, {
    body: "Come see the new loft",
    sends: [
      {
        guest: { name: "Sam", placeId: results[0].placeId },
        birdId: world.max.birds[0].id,
      },
    ],
  })) as GuestSendResult;
  const url = result.guestLinks[0].url;
  return url.slice(url.lastIndexOf("-") + 1);
}

function withoutServerNow(json: Record<string, unknown>) {
  const { serverNow, ...rest } = json;
  expect(typeof serverNow).toBe("number");
  return rest;
}

describe("POST /api/guest/[token]/report", () => {
  it("hides the link behind the same 404 as a wrong token (ac-3)", async () => {
    const token = await guestToken();

    const reported = await reporter(token).post({ reason: "Spam" });
    expect(reported.status).toBe(200);
    expect(withoutServerNow(reported.json)).toEqual({});

    const after = await view(token).get({});
    const wrong = await view("AAAAAAAAAAAAAAAA").get({});
    expect(after.status).toBe(404);
    expect(withoutServerNow(after.json)).toEqual(withoutServerNow(wrong.json));
  });

  it("refuses an empty reason as 400 invalid and leaves the link viewable", async () => {
    const token = await guestToken();

    const { status, json } = await reporter(token).post({ reason: "   " });

    expect(status).toBe(400);
    expect(json.error.code).toBe("invalid");
    expect((await view(token).get({})).status).toBe(200);
  });
});
