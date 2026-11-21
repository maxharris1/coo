import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toE164, type E164 } from "@/lib/phone";
import { createJsonRoute } from "@/server/http";
import { tick } from "@/server/services/tick";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { FakeJar } from "@/test/fakes/jar";
import { seedWorld } from "@/test/seedWorld";
import { cronTickPost } from "./post";

vi.mock("@/server/services/tick", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/services/tick")>();
  return { ...real, tick: vi.fn(real.tick) };
});

const SECRET = "cron-secret-value";

let deps: TestDeps;

beforeEach(async () => {
  vi.mocked(tick).mockClear();
  deps = await makeTestDeps();
  await seedWorld(deps.db, deps.clock.now());
});

async function post(headers: Record<string, string> = {}) {
  const res = await cronTickPost(
    createJsonRoute(async () => deps),
    () => SECRET,
  )(
    new NextRequest("https://coo.test/api/cron/tick", {
      method: "POST",
      headers,
    }),
  );
  return { status: res.status, json: await res.json() };
}

async function sessionCookie(phone: string) {
  const jar = new FakeJar();
  const id = await deps.auth(jar).verifyCode(toE164(phone) as E164, "000000");
  if (!id) throw new Error("test sign-in failed");
  return jar
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");
}

describe("POST /api/cron/tick", () => {
  it.each([
    ["no Authorization header", {}],
    [
      "a wrong secret of the same length",
      { authorization: `Bearer ${"x".repeat(SECRET.length)}` },
    ],
    ["a wrong secret of another length", { authorization: "Bearer nope" }],
    ["the bare secret without Bearer", { authorization: SECRET }],
  ])("refuses %s as unauthenticated without ticking", async (_, headers) => {
    const { status, json } = await post(headers);

    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
    expect(tick).not.toHaveBeenCalled();
  });

  it("refuses a signed-in user's session without the secret", async () => {
    const cookie = await sessionCookie("+15550000001");

    const { status, json } = await post({ cookie });

    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
    expect(tick).not.toHaveBeenCalled();
  });

  it("runs the tick for every user with the right secret and returns its counts", async () => {
    const { status, json } = await post({ authorization: `Bearer ${SECRET}` });

    expect(status).toBe(200);
    expect(tick).toHaveBeenCalledTimes(1);
    expect(tick).toHaveBeenCalledWith(deps);
    expect(json.timedOut).toBe(false);
    expect(Object.keys(json.counts).length).toBeGreaterThan(0);
    expect(Object.values(json.counts).every((n) => n === 0)).toBe(true);
    expect(json.serverNow).toBe(deps.clock.now());
  });
});
