import { NextRequest } from "next/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Env } from "@/env";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { createJsonRoute } from "./http";

let deps: TestDeps;

beforeAll(async () => {
  deps = await makeTestDeps();
});

function routeFor(appEnv?: () => Env["APP_ENV"]) {
  const build = vi.fn(async () => deps);
  const run = vi.fn(async () => ({ ran: true }));
  const handler = createJsonRoute(build, { appEnv })(
    "public",
    { devOnly: true },
    run,
  );
  return { build, run, handler };
}

const request = () =>
  new NextRequest("https://coo.test/api/dev/x", {
    method: "POST",
    headers: { origin: "https://elsewhere.test" },
  });

describe("devOnly routes", () => {
  it.each([
    ["APP_ENV=production", () => "production" as const],
    ["no APP_ENV source", undefined],
  ])(
    "answer 404 not_found under %s before building deps",
    async (_, appEnv) => {
      const { build, run, handler } = routeFor(appEnv);
      const res = await handler(request());
      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({
        error: { code: "not_found" },
        serverNow: expect.any(Number),
      });
      expect(build).not.toHaveBeenCalled();
      expect(run).not.toHaveBeenCalled();
    },
  );

  it.each(["development", "preview", "test"] as const)(
    "run under APP_ENV=%s",
    async (env) => {
      const { run, handler } = routeFor(() => env);
      const res = await handler(
        new NextRequest("https://coo.test/api/dev/x", { method: "POST" }),
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ ran: true });
      expect(run).toHaveBeenCalledOnce();
    },
  );

  it("leave routes without devOnly open under production", async () => {
    const handler = createJsonRoute(async () => deps, {
      appEnv: () => "production",
    })("public", {}, async () => ({ ran: true }));
    const res = await handler(
      new NextRequest("https://coo.test/api/x", { method: "POST" }),
    );
    expect(res.status).toBe(200);
  });

  it("stamp serverNow from the deps a handler rebuilt", async () => {
    const later = await makeTestDeps({ db: deps.db });
    later.clock.set(deps.clock.now() + 60_000);
    const build = vi
      .fn<() => Promise<TestDeps>>()
      .mockResolvedValueOnce(deps)
      .mockResolvedValueOnce(later);
    const handler = createJsonRoute(build, { appEnv: () => "test" })(
      "public",
      { devOnly: true },
      async ({ rebuild }) => {
        await rebuild();
        return {};
      },
    );
    const res = await handler(
      new NextRequest("https://coo.test/api/dev/x", { method: "POST" }),
    );
    expect((await res.json()).serverNow).toBe(later.clock.now());
    expect(build).toHaveBeenCalledTimes(2);
  });
});
