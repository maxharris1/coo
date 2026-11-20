import { NextRequest } from "next/server";
import { expect, it, vi } from "vitest";

const { queries } = vi.hoisted(() => ({ queries: [] as string[] }));

vi.mock("@/env", () => ({ getEnv: () => ({ APP_ENV: "preview" }) }));
vi.mock("@/server/db", () => ({
  getDb: () => ({
    async query(sql: string) {
      queries.push(sql);
      throw new Error(
        "simulated database unavailable during clock initialization",
      );
    },
  }),
}));

import { GET } from "./route";

it("includes serverNow when the real GET fails to initialize its clock", async () => {
  const response = await GET(new NextRequest("https://coo.test/api/sync"));
  const json: unknown = await response.json();
  expect(response.status).toBe(500);
  expect(queries).toEqual(["select offset_ms from dev_clock"]);
  expect(json).toEqual({
    error: { code: "internal", message: expect.any(String) },
    serverNow: expect.any(Number),
  });
});
