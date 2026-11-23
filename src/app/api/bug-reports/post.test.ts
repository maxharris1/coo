import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import type { UserId } from "@/server/ports/auth";
import { createJsonRoute } from "@/server/http";
import { onboard } from "@/server/services/onboarding";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import type { FakeJar } from "@/test/fakes/jar";
import { geoClient } from "@/test/geoRoute";
import { bugReportsPost } from "./post";

const SETUP = {
  timezone: "America/New_York",
  bird: { name: "Gerald", look: "gerald", pronoun: "he" },
};
const SERVER = { build: "0123456789ab", appEnv: "preview" as const };
const ENDPOINT = "https://coo.test/api/bug-reports";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

let deps: TestDeps;
let client: ReturnType<typeof geoClient>;
let handler: (req: NextRequest) => Promise<Response>;

beforeEach(async () => {
  deps = await makeTestDeps();
  const jsonRoute = createJsonRoute(async () => deps);
  handler = bugReportsPost(jsonRoute, () => SERVER);
  client = geoClient(deps, () => handler, "/api/bug-reports", jsonRoute);
});

async function onboarded(number: string, name: string) {
  const session = await client.signIn(number);
  await onboard(deps, session.id as UserId, { ...SETUP, name });
  await deps.db.query(
    "update profiles set onboarded_at = to_timestamp($2 / 1000.0) where id = $1",
    [session.id, deps.clock.now()],
  );
  return session;
}

function validBody() {
  return {
    clientKey: randomUUID(),
    body: "it broke",
    context: {
      route: "/loft",
      standalone: false,
      viewport: { w: 390, h: 844 },
      timeZone: "America/New_York",
    },
  };
}

async function rawPost(
  body: unknown,
  jar: FakeJar | undefined,
  headers: Record<string, string>,
) {
  const cookie = (jar?.getAll() ?? [])
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");
  const res = await handler(
    new NextRequest(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", cookie, ...headers },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: await res.json() };
}

async function rowCount() {
  const [{ count }] = await deps.db.query<{ count: number }>(
    "select count(*)::int as count from bug_reports",
  );
  return count;
}

async function rows() {
  return deps.db.query<{
    id: string;
    user_id: string;
    status: string;
    body: string;
    context: Record<string, unknown>;
    created_at: Date;
  }>(
    "select id, user_id, status, body, context, created_at from bug_reports order by created_at, id",
  );
}

describe("POST /api/bug-reports", () => {
  it("refuses a request without a session as 401 unauthenticated", async () => {
    const { status, json } = await client.post(validBody());

    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
    expect(await rowCount()).toBe(0);
  });

  it("refuses a signed-in person who has not onboarded as 409 not_onboarded", async () => {
    const max = await client.signIn("(555) 123-4567");

    const { status, json } = await client.post(validBody(), max.jar);

    expect(status).toBe(409);
    expect(json.error.code).toBe("not_onboarded");
    expect(await rowCount()).toBe(0);
  });

  it.each([
    [
      "a cross-site origin",
      { origin: "https://evil.example" },
      403,
      "forbidden",
    ],
    ["a text/plain body", { "content-type": "text/plain" }, 400, "invalid"],
  ])("refuses %s", async (_, headers, code, error) => {
    const max = await onboarded("(555) 123-4567", "Max");

    const { status, json } = await rawPost(validBody(), max.jar, headers);

    expect(status).toBe(code);
    expect(json.error.code).toBe(error);
    expect(await rowCount()).toBe(0);
  });

  it("files a report with the caller, trimmed body, server context and clock time", async () => {
    const max = await onboarded("(555) 123-4567", "Max");
    deps.clock.advance(90_000);

    const { status, json } = await client.post(
      { ...validBody(), body: "  it broke\n  " },
      max.jar,
    );

    expect(status).toBe(200);
    expect(json.id).toMatch(UUID);
    expect(json.serverNow).toBe(deps.clock.now());
    const [row] = await rows();
    expect(row).toMatchObject({
      id: json.id,
      user_id: max.id,
      status: "new",
      body: "it broke",
      created_at: new Date(deps.clock.now()),
    });
    expect(Object.keys(row.context).sort()).toEqual([
      "appEnv",
      "build",
      "route",
      "standalone",
      "timeZone",
      "userAgent",
      "viewport",
    ]);
    expect(row.context).toMatchObject(SERVER);
    expect(await rowCount()).toBe(1);
  });

  it("stores a 400-character user agent cut to 300 characters", async () => {
    const max = await onboarded("(555) 123-4567", "Max");

    const { status } = await rawPost(validBody(), max.jar, {
      "user-agent": "M".repeat(400),
    });

    expect(status).toBe(200);
    const [row] = await rows();
    expect(row.context.userAgent).toBe("M".repeat(300));
  });

  it.each<[string, (b: ReturnType<typeof validBody>) => object]>([
    ["a missing clientKey", (b) => ({ ...b, clientKey: undefined })],
    ["a clientKey that is not a uuid", (b) => ({ ...b, clientKey: "abc" })],
    ["an empty body", (b) => ({ ...b, body: "" })],
    ["a whitespace body", (b) => ({ ...b, body: "   \n " })],
    ["a 2001-character body", (b) => ({ ...b, body: "a".repeat(2001) })],
    ["an extra top-level key", (b) => ({ ...b, note: "x" })],
    [
      "an extra context key",
      (b) => ({ ...b, context: { ...b.context, theme: "dark" } }),
    ],
    [
      "a browser-sent context.build",
      (b) => ({ ...b, context: { ...b.context, build: "abc" } }),
    ],
    ["a userId", (b) => ({ ...b, userId: randomUUID() })],
    ["a status", (b) => ({ ...b, status: "fixed" })],
    ["a top-level issueNumber", (b) => ({ ...b, issueNumber: 7 })],
    [
      "viewport.w 0",
      (b) => ({ ...b, context: { ...b.context, viewport: { w: 0, h: 844 } } }),
    ],
    [
      "viewport.w 10001",
      (b) => ({
        ...b,
        context: { ...b.context, viewport: { w: 10001, h: 844 } },
      }),
    ],
    [
      "viewport.h 1.5",
      (b) => ({
        ...b,
        context: { ...b.context, viewport: { w: 390, h: 1.5 } },
      }),
    ],
    [
      "a timeZone with a NUL",
      (b) => ({
        ...b,
        context: { ...b.context, timeZone: "America/New\u0000York" },
      }),
    ],
  ])("answers %s with 400 invalid and stores nothing", async (_, edit) => {
    const max = await onboarded("(555) 123-4567", "Max");

    const { status, json } = await client.post(edit(validBody()), max.jar);

    expect(status).toBe(400);
    expect(json.error.code).toBe("invalid");
    expect(await rowCount()).toBe(0);
  });

  it.each([
    ["exactly 2000 characters", "a".repeat(2000), "a".repeat(2000)],
    ["a NUL", "a\u0000b", "ab"],
  ])("accepts a body with %s", async (_, body, stored) => {
    const max = await onboarded("(555) 123-4567", "Max");

    const { status } = await client.post({ ...validBody(), body }, max.jar);

    expect(status).toBe(200);
    expect((await rows()).map((row) => row.body)).toEqual([stored]);
  });

  it("refuses the 6th distinct report in an hour as 429 rate_limited", async () => {
    const max = await onboarded("(555) 123-4567", "Max");
    const limit = deps.config.game.limits.bugReportsPerHour;

    for (let i = 0; i < limit; i++) {
      expect((await client.post(validBody(), max.jar)).status).toBe(200);
    }
    const over = await client.post(validBody(), max.jar);

    expect(limit).toBe(5);
    expect(over.status).toBe(429);
    expect(over.json.error.code).toBe("rate_limited");
    expect(await rowCount()).toBe(limit);
  });

  it("files under the caller and never under a userId named in the body", async () => {
    const priya = await onboarded("(555) 765-4321", "Priya");
    const max = await onboarded("(555) 123-4567", "Max");

    const spoofed = await client.post(
      { ...validBody(), userId: priya.id },
      max.jar,
    );
    const filed = await client.post(validBody(), max.jar);

    expect(spoofed.status).toBe(400);
    expect(spoofed.json.error.code).toBe("invalid");
    expect(filed.status).toBe(200);
    expect((await rows()).map((row) => row.user_id)).toEqual([max.id]);
  });
});
