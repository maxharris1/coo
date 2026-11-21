import { readdirSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { getRouteMatcher } from "next/dist/shared/lib/router/utils/route-matcher";
import { getRouteRegex } from "next/dist/shared/lib/router/utils/route-regex";
import { getSortedRoutes } from "next/dist/shared/lib/router/utils/sorted-routes";
import { normalizeRepeatedSlashes } from "next/dist/shared/lib/utils";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDeps, type TestDeps } from "@/test/deps";

const { current } = vi.hoisted(() => ({ current: { deps: null as unknown } }));

vi.mock("@/env", () => ({
  getEnv: () => ({ LINK_TOKEN_PEPPER: "test-pepper" }),
}));
vi.mock("@/server/http", async (importOriginal) => {
  const http = await importOriginal<typeof import("@/server/http")>();
  return {
    ...http,
    jsonRoute: http.createJsonRoute(async () => current.deps as TestDeps),
  };
});

const APP = join(process.cwd(), "src/app");
const routeFiles = new Map(
  readdirSync(join(APP, "api"), { recursive: true, encoding: "utf8" })
    .filter((file) => /(^|\/)route\.ts$/.test(file))
    .map((file) => [
      `/api/${dirname(file).split(sep).join("/")}`,
      join(APP, "api", file),
    ]),
);
const precedence = getSortedRoutes([...routeFiles.keys()]);

async function dispatch(method: "GET" | "POST", url: string) {
  const pathname = normalizeRepeatedSlashes(url);
  const route = precedence.find((p) =>
    getRouteMatcher(getRouteRegex(p))(pathname),
  );
  if (!route) return { route, status: 404, json: null };
  const mod: Record<string, unknown> = await import(routeFiles.get(route)!);
  const handler = mod[method] as
    ((req: NextRequest) => Promise<Response>) | undefined;
  if (!handler) return { route, status: 405, json: null };
  const res = await handler(
    new NextRequest(`https://coo.test${pathname}`, {
      method,
      ...(method === "POST" && {
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "Spam" }),
      }),
    }),
  );
  return { route, status: res.status, json: await res.json() };
}

function withoutServerNow(json: Record<string, unknown>) {
  const { serverNow, ...rest } = json;
  expect(typeof serverNow).toBe("number");
  return rest;
}

beforeEach(async () => {
  current.deps = await makeTestDeps();
});

describe("guest link routing (ac-2)", () => {
  it.each([
    ["GET", "/api/guest/"],
    ["GET", "/api/guest"],
    ["POST", "/api/guest//report"],
    ["POST", "/api/guest/report"],
  ] as const)(
    "%s %s reaches a handler that answers like a wrong token",
    async (method, url) => {
      const wrong = await dispatch(
        method,
        method === "GET"
          ? "/api/guest/AAAAAAAAAAAAAAAA"
          : "/api/guest/AAAAAAAAAAAAAAAA/report",
      );
      expect(wrong.status).toBe(404);
      expect(wrong.json.error.code).toBe("not_found");

      const missing = await dispatch(method, url);

      expect(missing.route).toBeDefined();
      expect(missing.status).toBe(404);
      expect(withoutServerNow(missing.json)).toEqual(
        withoutServerNow(wrong.json),
      );
    },
  );
});
