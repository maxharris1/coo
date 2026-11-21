import { beforeEach, describe, expect, it } from "vitest";
import type { UserId } from "@/server/ports/auth";
import { onboard } from "@/server/services/onboarding";
import { TEST_SESSION_COOKIE } from "@/server/testAuth";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { geoClient } from "@/test/geoRoute";
import { accountDelete } from "./delete";

const SETUP = {
  timezone: "America/New_York",
  bird: { name: "Gerald", look: "gerald", pronoun: "he" },
};

let deps: TestDeps;
let client: ReturnType<typeof geoClient>;

beforeEach(async () => {
  deps = await makeTestDeps();
  client = geoClient(deps, accountDelete, "/api/account");
});

async function onboarded(number: string, name: string) {
  const session = await client.signIn(number);
  const { me } = await onboard(deps, session.id as UserId, { ...SETUP, name });
  await deps.db.query(
    "update profiles set onboarded_at = to_timestamp($2 / 1000.0) where id = $1",
    [session.id, deps.clock.now()],
  );
  return { ...session, handle: me.handle };
}

const exists = async (id: string) =>
  (
    await deps.db.query<{ n: number }>(
      "select count(*)::int as n from auth.users where id = $1",
      [id],
    )
  )[0].n === 1;

describe("DELETE /api/account", () => {
  it("refuses a request without a session as 401", async () => {
    const { status, json } = await client.del(undefined, { confirm: "max" });
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
  });

  it.each([
    ["no body field", {}],
    ["an empty handle", { confirm: "" }],
    ["a wrong handle", { confirm: "someone" }],
    ["an unknown key", { confirm: "max", really: true }],
  ])("answers %s with 400 invalid and keeps the account", async (_, body) => {
    const max = await onboarded("(555) 123-4567", "Max");
    const { status, json } = await client.del(max.jar, body);
    expect(status).toBe(400);
    expect(json.error.code).toBe("invalid");
    expect(json.error.message).toMatch(/confirm|body|really/);
    expect(await exists(max.id)).toBe(true);
  });

  it("refuses someone else's handle and deletes neither account", async () => {
    const priya = await onboarded("(555) 765-4321", "Priya");
    const max = await onboarded("(555) 123-4567", "Max");
    const { status, json } = await client.del(max.jar, {
      confirm: priya.handle,
    });
    expect(status).toBe(400);
    expect(json.error.code).toBe("invalid");
    expect(await exists(max.id)).toBe(true);
    expect(await exists(priya.id)).toBe(true);
  });

  it("deletes the caller's account when they type their handle", async () => {
    const priya = await onboarded("(555) 765-4321", "Priya");
    const max = await onboarded("(555) 123-4567", "Max");
    const { status, json } = await client.del(max.jar, { confirm: max.handle });
    expect(status).toBe(200);
    expect(json.deleted).toBe(true);
    expect(typeof json.serverNow).toBe("number");
    expect(await exists(max.id)).toBe(false);
    expect(await exists(priya.id)).toBe(true);
  });

  it("accepts the handle typed with capitals and stray spaces", async () => {
    const max = await onboarded("(555) 123-4567", "Max");
    const { status } = await client.del(max.jar, {
      confirm: `  ${max.handle.toUpperCase()} `,
    });
    expect(status).toBe(200);
    expect(await exists(max.id)).toBe(false);
  });

  it("clears the session cookie once the account is gone", async () => {
    const max = await onboarded("(555) 123-4567", "Max");
    const { setCookie } = await client.del(max.jar, { confirm: max.handle });
    expect(setCookie).toMatch(
      new RegExp(`${TEST_SESSION_COOKIE}=;.*Max-Age=0`, "i"),
    );
  });

  it("keeps the session cookie when the handle is wrong", async () => {
    const max = await onboarded("(555) 123-4567", "Max");
    const { setCookie } = await client.del(max.jar, { confirm: "nope" });
    expect(setCookie).not.toContain(TEST_SESSION_COOKIE);
  });
});
