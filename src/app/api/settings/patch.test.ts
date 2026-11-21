import { beforeEach, describe, expect, it } from "vitest";
import type { UserId } from "@/server/ports/auth";
import { onboard } from "@/server/services/onboarding";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { geoClient } from "@/test/geoRoute";
import { syncGet } from "../sync/get";
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

async function profile(id: string) {
  const [row] = await deps.db.query<Record<string, unknown>>(
    "select * from profiles where id = $1",
    [id],
  );
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
    ["an unknown key", { installed: true, colour: "red" }],
    ["only an account", { account: "00000000-0000-4000-8000-000000000000" }],
    ["a column name as a key", { sms_fallback: false }],
    ["units in feet", { units: "ft" }],
    ["an empty name", { name: "   " }],
    ["a 31-character name", { name: "M".repeat(31) }],
    ["a quiet hour of 24", { quietStart: 24 }],
    ["a fractional quiet hour", { quietEnd: 6.5 }],
    ["a switch given as a string", { notifyDelays: "false" }],
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

  it("refuses an install checked for another account as 409 conflict and writes nothing", async () => {
    const other = await onboarded("(555) 765-4321", "Brenda");
    const { id, jar } = await onboarded("(555) 123-4567", "Max");
    const { status, json } = await client.patch(
      { installed: true, account: other.id },
      jar,
    );
    expect(status).toBe(409);
    expect(json.error.code).toBe("conflict");
    expect((await columns(id)).installed).toBe(false);
    expect((await columns(other.id)).installed).toBe(false);
  });

  it("records the install when the checked account is the caller", async () => {
    const { id, jar } = await onboarded("(555) 123-4567", "Max");
    const { status, json } = await client.patch(
      { installed: true, account: id },
      jar,
    );
    expect(status).toBe(200);
    expect(json.me).toMatchObject({ id, installed: true });
    expect((await columns(id)).installed).toBe(true);
  });

  it("answers a checked account that is not an id with 400 invalid", async () => {
    const { id, jar } = await onboarded("(555) 123-4567", "Max");
    const { status } = await client.patch(
      { installed: true, account: "me" },
      jar,
    );
    expect(status).toBe(400);
    expect((await columns(id)).installed).toBe(false);
  });

  it.each([
    ["name", "Maxine", "name", "Maxine"],
    ["units", "km", "units", "km"],
    ["notifyLandedIn", false, "notify_landed_in", false],
    ["notifyLandedOut", false, "notify_landed_out", false],
    ["notifyDelays", false, "notify_delays", false],
    ["notifyHungry", false, "notify_hungry", false],
    ["quietOn", false, "quiet_on", false],
    ["quietStart", 23, "quiet_start", 23],
    ["quietEnd", 0, "quiet_end", 0],
    ["smsFallback", false, "sms_fallback", false],
    ["installed", true, "installed", true],
  ])("saves %s and leaves the other settings alone", async (key, value, column, stored) => {
    const { id, jar } = await onboarded("(555) 123-4567", "Max");
    const before = await profile(id);
    const { status, json } = await client.patch({ [key]: value }, jar);
    expect(status).toBe(200);
    expect(json.me.id).toBe(id);
    expect(await profile(id)).toEqual({ ...before, [column]: stored });
  });

  it("saves several settings in one request", async () => {
    const { id, jar } = await onboarded("(555) 123-4567", "Max");
    const { status, json } = await client.patch(
      { quietOn: true, quietStart: 21, quietEnd: 6, account: id },
      jar,
    );
    expect(status).toBe(200);
    expect(json.me.settings).toMatchObject({
      quietOn: true,
      quietStart: 21,
      quietEnd: 6,
    });
  });

  it("trims a new name before saving it", async () => {
    const { id, jar } = await onboarded("(555) 123-4567", "Max");
    const { json } = await client.patch({ name: "  Maxine  " }, jar);
    expect(json.me.name).toBe("Maxine");
    expect((await profile(id)).name).toBe("Maxine");
  });

  it("shows km on the next sync after PATCH units km, and a repeat changes nothing", async () => {
    const { id, jar } = await onboarded("(555) 123-4567", "Max");
    const sync = geoClient(deps, syncGet, "/api/sync");
    const first = await client.patch({ units: "km", account: id }, jar);
    expect(first.status).toBe(200);
    expect(first.json.me.units).toBe("km");
    const { status, json } = await sync.get({}, jar);
    expect(status).toBe(200);
    expect(json.me.units).toBe("km");
    const saved = await profile(id);
    const again = await client.patch({ units: "km", account: id }, jar);
    expect(again.status).toBe(200);
    expect(again.json.me).toEqual(first.json.me);
    expect(await profile(id)).toEqual(saved);
  });

  it("refuses a units change checked for another account as 409 conflict and writes nothing", async () => {
    const other = await onboarded("(555) 765-4321", "Brenda");
    const { id, jar } = await onboarded("(555) 123-4567", "Max");
    const mine = await profile(id);
    const theirs = await profile(other.id);
    const { status, json } = await client.patch(
      { units: "km", name: "Brenda", account: other.id },
      jar,
    );
    expect(status).toBe(409);
    expect(json.error.code).toBe("conflict");
    expect(await profile(id)).toEqual(mine);
    expect(await profile(other.id)).toEqual(theirs);
  });

  it("returns the caller's phone ending once known", async () => {
    const { id, jar } = await onboarded("(555) 123-4567", "Max");
    await deps.db.query(
      "update profiles set phone_last4 = '4567' where id = $1",
      [id],
    );
    const { json } = await client.patch({ units: "km" }, jar);
    expect(json.me.phoneLast4).toBe("4567");
  });
});
