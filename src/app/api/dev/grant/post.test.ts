import { beforeEach, describe, expect, it } from "vitest";
import type { UserId } from "@/server/ports/auth";
import { onboard } from "@/server/services/onboarding";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { devClockRoute } from "@/test/devClockRoute";
import { geoClient } from "@/test/geoRoute";
import { devGrantPost } from "./post";

let deps: TestDeps;
let client: ReturnType<typeof geoClient>;

beforeEach(async () => {
  deps = await makeTestDeps();
  client = geoClient(deps, devGrantPost, "/api/dev/grant", devClockRoute(deps));
});

async function onboarded(number: string, name: string) {
  const session = await client.signIn(number);
  await onboard(deps, session.id as UserId, {
    timezone: "America/New_York",
    name,
    bird: { name: "Gerald", look: "gerald", pronoun: "he" },
  });
  await deps.db.query(
    "update profiles set onboarded_at = to_timestamp($2 / 1000.0) where id = $1",
    [session.id, deps.clock.now()],
  );
  return session;
}

const ref = () => crypto.randomUUID();

async function grantRefs(id: string) {
  const rows = await deps.db.query<{ ref_id: string | null }>(
    "select ref_id from seed_ledger where user_id = $1 and reason = 'dev_grant' order by id",
    [id],
  );
  return rows.map((row) => row.ref_id);
}

async function account(id: string) {
  const [row] = await deps.db.query<{
    seeds: number;
    ledger: number;
    grants: number;
  }>(
    `select seeds,
       (select coalesce(sum(delta), 0)::int from seed_ledger where user_id = $1) as ledger,
       (select count(*)::int from seed_ledger where user_id = $1 and reason = 'dev_grant') as grants
     from profiles where id = $1`,
    [id],
  );
  return row;
}

describe("POST /api/dev/grant", () => {
  it("refuses a request without a session as 401", async () => {
    const { status, json } = await client.post({ seeds: 500, ref: ref() });
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
  });

  it.each([
    ["an empty body", {}],
    ["a missing ref", { seeds: 500 }],
    ["a non-uuid ref", { seeds: 500, ref: "retry-1" }],
    ["zero seeds", { seeds: 0, ref: ref() }],
    ["negative seeds", { seeds: -5, ref: ref() }],
    ["fractional seeds", { seeds: 1.5, ref: ref() }],
    ["more than 10,000 seeds", { seeds: 10_001, ref: ref() }],
  ])("answers %s with 400 invalid", async (_, body) => {
    const { id, jar } = await onboarded("(555) 123-4567", "Max");
    const before = await account(id);
    const { status, json } = await client.post(body, jar);
    expect(status).toBe(400);
    expect(json.error.code).toBe("invalid");
    expect(await account(id)).toEqual(before);
  });

  it("pays the caller through apply_seeds and returns the new balance", async () => {
    const { id, jar } = await onboarded("(555) 123-4567", "Max");
    const before = await account(id);
    const first = await client.post({ seeds: 500, ref: ref() }, jar);
    expect(first.status).toBe(200);
    expect(first.json.seeds).toBe(before.seeds + 500);
    const second = await client.post({ seeds: 500, ref: ref() }, jar);
    expect(second.json.seeds).toBe(before.seeds + 1000);
    const after = await account(id);
    expect(after).toEqual({
      seeds: before.seeds + 1000,
      ledger: after.seeds,
      grants: 2,
    });
  });

  it("refuses someone else's id and pays nobody", async () => {
    const other = await onboarded("(555) 765-4321", "Brenda");
    const { id, jar } = await onboarded("(555) 123-4567", "Max");
    const mine = await account(id);
    const theirs = await account(other.id);
    const { status, json } = await client.post(
      { seeds: 500, ref: ref(), userId: other.id },
      jar,
    );
    expect(status).toBe(400);
    expect(json.error.code).toBe("invalid");
    expect(await account(id)).toEqual(mine);
    expect(await account(other.id)).toEqual(theirs);
  });

  it("pays only the caller, never anyone else", async () => {
    const other = await onboarded("(555) 765-4321", "Brenda");
    const { id, jar } = await onboarded("(555) 123-4567", "Max");
    const theirs = await account(other.id);
    await client.post({ seeds: 500, ref: ref() }, jar);
    expect((await account(id)).grants).toBe(1);
    expect(await account(other.id)).toEqual(theirs);
  });

  it("pays a replayed ref once and records the ref on the ledger row", async () => {
    const { id, jar } = await onboarded("(555) 123-4567", "Max");
    const before = await account(id);
    const body = { seeds: 500, ref: ref() };
    const first = await client.post(body, jar);
    expect(first.json.seeds).toBe(before.seeds + 500);
    const replay = await client.post(body, jar);
    expect(replay.status).toBe(200);
    expect(replay.json.seeds).toBe(before.seeds + 500);
    expect((await account(id)).seeds).toBe(before.seeds + 500);
    expect(await grantRefs(id)).toEqual([body.ref]);
  });

  it("pays distinct refs separately, each ledger row carrying its ref", async () => {
    const { id, jar } = await onboarded("(555) 123-4567", "Max");
    const before = await account(id);
    const refs = [ref(), ref()];
    for (const r of refs) await client.post({ seeds: 500, ref: r }, jar);
    expect((await account(id)).seeds).toBe(before.seeds + 1000);
    expect(await grantRefs(id)).toEqual(refs);
  });
});
