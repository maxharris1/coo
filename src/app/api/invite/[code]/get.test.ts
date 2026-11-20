import { beforeEach, describe, expect, it } from "vitest";
import type { UserId } from "@/server/ports/auth";
import { onboard } from "@/server/services/onboarding";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { geoClient } from "@/test/geoRoute";
import { inviteGet } from "./get";

let deps: TestDeps;

beforeEach(async () => {
  deps = await makeTestDeps();
});

function client(code: string) {
  return geoClient(deps, inviteGet, `/api/invite/${encodeURIComponent(code)}`);
}

async function inviter(number: string, name: string) {
  const session = await client("x").signIn(number);
  const { me } = await onboard(deps, session.id as UserId, {
    timezone: "America/New_York",
    bird: { name: "Gerald", look: "gerald", pronoun: "he" },
    name,
  });
  return { ...session, code: me.inviteCode };
}

describe("GET /api/invite/[code]", () => {
  it("names the inviter to someone with no session, and nothing more", async () => {
    const priya = await inviter("(555) 765-4321", "Priya");

    const { status, json } = await client(priya.code).get({});

    expect(status).toBe(200);
    const { serverNow, ...rest } = json;
    expect(typeof serverNow).toBe("number");
    expect(rest).toEqual({ name: "Priya" });
  });

  it("answers an unknown code with 404 not_found", async () => {
    await inviter("(555) 765-4321", "Priya");
    const { status, json } = await client("nobody-AAAAAAAAAAAA").get({});
    expect(status).toBe(404);
    expect(json.error.code).toBe("not_found");
  });

  it("answers a user id in place of a code with 404 not_found", async () => {
    const priya = await inviter("(555) 765-4321", "Priya");
    const { status } = await client(priya.id).get({});
    expect(status).toBe(404);
  });

  it("answers a malformed escape with 404 not_found", async () => {
    const { status, json } = await geoClient(
      deps,
      inviteGet,
      "/api/invite/%E0%A4%A",
    ).get({});
    expect(status).toBe(404);
    expect(json.error.code).toBe("not_found");
  });
});
