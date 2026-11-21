import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({
  getEnv: () => ({ APP_ENV: "production" }),
  readAppEnv: () => "production",
}));
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

describe("dev routes under APP_ENV=production", () => {
  it("finds /api/dev/clock and /api/dev/grant", () => {
    expect(routes.map((file) => relative(DEV, file)).sort()).toEqual(
      expect.arrayContaining(["clock/route.ts", "grant/route.ts"]),
    );
  });

  it.each(routes.map((file) => [relative(process.cwd(), file), file]))(
    "%s answers every method with 404 not_found",
    async (_, file) => {
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
        expect(res.status).toBe(404);
        expect((await res.json()).error.code).toBe("not_found");
      }
    },
  );
});
