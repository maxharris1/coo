import { beforeEach, describe, expect, it } from "vitest";
import type { UserId } from "@/server/ports/auth";
import { joinByCode } from "@/server/services/friends";
import { onboard } from "@/server/services/onboarding";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { geoClient } from "@/test/geoRoute";
import { inviteGet } from "../[code]/get";
import { inviteResetPost } from "./post";

const SETUP = {
  timezone: "America/New_York",
  bird: { name: "Gerald", look: "gerald", pronoun: "he" },
};

let deps: TestDeps;
let client: ReturnType<typeof geoClient>;

beforeEach(async () => {
  deps = await makeTestDeps();
  client = geoClient(deps, inviteResetPost, "/api/invite/reset");
});

async function onboarded(number: string, name: string) {
  const session = await client.signIn(number);
  const { me } = await onboard(deps, session.id as UserId, {
    ...SETUP,
    name,
  });
  await deps.db.query(
    "update profiles set onboarded_at = to_timestamp($2 / 1000.0) where id = $1",
    [session.id, deps.clock.now()],
  );
  return { ...session, code: me.inviteCode };
}

function lookup(code: string) {
  return geoClient(
    deps,
    inviteGet,
    `/api/invite/${encodeURIComponent(code)}`,
  ).get({});
}

describe("POST /api/invite/reset", () => {
  it("refuses a request without a session as 401", async () => {
    const priya = await onboarded("(555) 765-4321", "Priya");
    const { status, json } = await client.post({});
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
    expect((await lookup(priya.code)).status).toBe(200);
  });

  it("gives a new code and makes the old code not_found", async () => {
    const priya = await onboarded("(555) 765-4321", "Priya");
    expect((await lookup(priya.code)).json.name).toBe("Priya");

    const { status, json } = await client.post({}, priya.jar);

    expect(status).toBe(200);
    expect(json.inviteCode).toMatch(/^priya-[\w-]{12}$/);
    expect(json.inviteCode).not.toBe(priya.code);
    const old = await lookup(priya.code);
    expect(old.status).toBe(404);
    expect(old.json.error.code).toBe("not_found");
    const fresh = await lookup(json.inviteCode);
    expect(fresh.status).toBe(200);
    expect(fresh.json.name).toBe("Priya");
  });

  it("makes joining with the old code not_found and the new code work", async () => {
    const priya = await onboarded("(555) 765-4321", "Priya");
    const max = await onboarded("(555) 123-4567", "Max");

    const { json } = await client.post({}, priya.jar);

    await expect(
      joinByCode(deps, max.id as UserId, priya.code),
    ).rejects.toMatchObject({ code: "not_found" });
    const joined = await joinByCode(deps, max.id as UserId, json.inviteCode);
    expect(joined.friend.id).toBe(priya.id);
  });

  it("gives a different code each time", async () => {
    const priya = await onboarded("(555) 765-4321", "Priya");
    const first = await client.post({}, priya.jar);
    const second = await client.post({}, priya.jar);
    expect(second.json.inviteCode).not.toBe(first.json.inviteCode);
    expect((await lookup(first.json.inviteCode)).status).toBe(404);
    expect((await lookup(second.json.inviteCode)).status).toBe(200);
  });

  it("only ever resets the caller's code, never someone named in the body", async () => {
    const priya = await onboarded("(555) 765-4321", "Priya");
    const max = await onboarded("(555) 123-4567", "Max");

    await client.post({ userId: priya.id }, max.jar);

    const theirs = await lookup(priya.code);
    expect(theirs.status).toBe(200);
    expect(theirs.json.name).toBe("Priya");
    expect((await lookup(max.code)).status).toBe(404);
  });
});
