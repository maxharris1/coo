import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { envSchema } from "@/env";

vi.mock("@/server/db", () => ({
  getDb: () => {
    throw new Error("a dev route reached the database in production");
  },
}));

const DEV = join(process.cwd(), "src/app/api/dev");
const routes = readdirSync(DEV, { recursive: true, encoding: "utf8" })
  .filter((file) => /(^|\/)route\.ts$/.test(file))
  .map((file) => join(DEV, file));
const METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE"] as const;

beforeEach(() => {
  vi.resetModules();
  for (const key of Object.keys(envSchema.shape)) vi.stubEnv(key, undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

it("finds /api/dev/clock and /api/dev/grant", () => {
  expect(routes.map((file) => relative(DEV, file)).sort()).toEqual(
    expect.arrayContaining(["clock/route.ts", "grant/route.ts"]),
  );
});

describe.each([
  ["only APP_ENV=production", { APP_ENV: "production" }],
  ["no APP_ENV", {}],
  [
    "APP_ENV=test on Vercel production",
    { APP_ENV: "test", VERCEL_ENV: "production" },
  ],
  ["APP_ENV=bogus", { APP_ENV: "bogus" }],
])("dev routes with %s and no other env", (_, vars: Record<string, string>) => {
  it.each(routes.map((file) => [relative(process.cwd(), file), file]))(
    "%s answers every method with 404 not_found",
    async (_, file) => {
      for (const [key, value] of Object.entries(vars)) vi.stubEnv(key, value);
      const mod: Record<string, unknown> = await import(file);
      const handlers = METHODS.filter((m) => typeof mod[m] === "function");
      expect(handlers.length).toBeGreaterThan(0);
      for (const method of handlers) {
        const handler = mod[method] as (req: NextRequest) => Promise<Response>;
        const res = await handler(
          new NextRequest(`https://coo.test/${relative(DEV, file)}`, {
            method,
            headers: { "content-type": "application/json" },
            body:
              method === "GET"
                ? undefined
                : JSON.stringify({ seeds: 500, ref: crypto.randomUUID() }),
          }),
        );
        expect({ status: res.status, body: await res.json() }).toMatchObject({
          status: 404,
          body: { error: { code: "not_found" } },
        });
      }
    },
  );
});
