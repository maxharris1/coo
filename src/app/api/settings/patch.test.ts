import { beforeEach, describe, expect, it } from "vitest";
import type { UserId } from "@/server/ports/auth";
import { onboard } from "@/server/services/onboarding";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { geoClient } from "@/test/geoRoute";
import { settingsPatch } from "./patch";

const SETUP = {
  timezone: "America/New_York",
  bird: { name: "Gerald", look: "gerald", pronoun: "he" },
};

let deps: TestDeps;
let client: ReturnType<typeof geoClient>;

beforeEach(async () => {
  deps = await makeTestDeps();
  client = geoClient(deps, settingsPatch, "/api/settings");
});

async function withProfile(number: string, name: string) {
  const session = await client.signIn(number);
  await onboard(deps, session.id as UserId, { ...SETUP, name });
  return session;
}

async function onboarded(number: string, name: string) {
  const session = await withProfile(number, name);
  await deps.db.query(
    "update profiles set onboarded_at = to_timestamp($2 / 1000.0) where id = $1",
    [session.id, deps.clock.now()],
  );
  return session;
}

async function columns(id: string) {
  const [row] = await deps.db.query<{
    installed: boolean;
    sms_fallback: boolean;
  }>("select installed, sms_fallback from profiles where id = $1", [id]);
  return row;
}

describe("PATCH /api/settings", () => {
  it("refuses a request without a session as 401", async () => {
    const { status, json } = await client.patch({ installed: true });
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
  });

  it("refuses a signed-in user with no profile as 409 not_onboarded", async () => {
    const { jar } = await client.signIn("(555) 123-4567");
    const { status, json } = await client.patch({ installed: true }, jar);
    expect(status).toBe(409);
    expect(json.error.code).toBe("not_onboarded");
  });

  it("refuses a user who has not finished onboarding and leaves them uninstalled", async () => {
    const { id, jar } = await withProfile("(555) 123-4567", "Max");
    const { status, json } = await client.patch({ installed: true }, jar);
    expect(status).toBe(409);
    expect(json.error.code).toBe("not_onboarded");
    expect((await columns(id)).installed).toBe(false);
  });

  it("starts a new profile uninstalled with the SMS fallback on", async () => {
    const { id } = await withProfile("(555) 123-4567", "Max");
    expect(await columns(id)).toEqual({ installed: false, sms_fallback: true });
  });

  it.each([
    ["an empty body", {}],
    ["installed false", { installed: false }],
    ["an unknown key", { installed: true, smsFallback: false }],
  ])("answers %s with 400 invalid and changes nothing", async (_, body) => {
    const { id, jar } = await onboarded("(555) 123-4567", "Max");
    const { status, json } = await client.patch(body, jar);
    expect(status).toBe(400);
    expect(json.error.code).toBe("invalid");
    expect(await columns(id)).toEqual({ installed: false, sms_fallback: true });
  });

  it("records the install and returns the caller's account, again on a repeat", async () => {
    const { id, jar } = await onboarded("(555) 123-4567", "Max");
    const first = await client.patch({ installed: true }, jar);
    expect(first.status).toBe(200);
    expect(first.json.me).toMatchObject({ id, installed: true });
    const again = await client.patch({ installed: true }, jar);
    expect(again.status).toBe(200);
    expect(again.json.me).toMatchObject({ id, installed: true });
    expect((await columns(id)).installed).toBe(true);
  });

  it("only ever marks the caller installed, never someone else", async () => {
    const other = await onboarded("(555) 765-4321", "Brenda");
    const { id, jar } = await onboarded("(555) 123-4567", "Max");
    const named = await client.patch(
      { installed: true, id: other.id, userId: other.id },
      jar,
    );
    expect(named.status).toBe(400);
    const plain = await client.patch({ installed: true }, jar);
    expect(plain.json.me.id).toBe(id);
    expect((await columns(id)).installed).toBe(true);
    expect((await columns(other.id)).installed).toBe(false);
  });
});
