import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authRoutes } from "@/app/api/auth/handlers";
import { createJsonRoute } from "@/server/http";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { postAuth } from "./postAuth";

const ORIGIN = "https://coo.test";

let deps: TestDeps;
let browser: typeof fetch;

beforeEach(async () => {
  vi.stubGlobal("fetch", () => {
    throw new Error("tests must not call the network");
  });
  deps = await makeTestDeps();
  const routes = authRoutes(createJsonRoute(async () => deps));
  const handlers: Record<string, (req: NextRequest) => Promise<Response>> = {
    "/api/auth/code": routes.code,
    "/api/auth/verify": routes.verify,
  };
  const cookies = new Map<string, string>();

  browser = (async (path: string, init: RequestInit) => {
    const headers = new Headers(init.headers);
    headers.set("origin", ORIGIN);
    headers.set(
      "cookie",
      [...cookies].map(([name, value]) => `${name}=${value}`).join("; "),
    );
    const res = (await handlers[path](
      new NextRequest(`${ORIGIN}${path}`, {
        method: init.method,
        body: init.body,
        headers,
      }),
    )) as Response & {
      cookies: { getAll(): { name: string; value: string; maxAge?: number }[] };
    };
    for (const { name, value, maxAge } of res.cookies.getAll()) {
      if (value === "" || maxAge === 0) cookies.delete(name);
      else cookies.set(name, value);
    }
    return res;
  }) as typeof fetch;
});

const userCount = async () =>
  (
    await deps.db.query<{ n: number }>(
      "select count(*)::int as n from auth.users",
    )
  )[0].n;

describe("the sign-in flow through postAuth and the real auth routes", () => {
  it("signs a new +1555 number in with 000000 and sends it to /welcome/install", async () => {
    expect(await userCount()).toBe(0);
    expect(
      await postAuth("/api/auth/code", { phone: "+15550100000" }, browser),
    ).toEqual({ ok: true, next: "/sign-in/verify" });
    expect(
      await postAuth("/api/auth/verify", { code: "000000" }, browser),
    ).toEqual({ ok: true, next: "/welcome/install" });
    expect(await userCount()).toBe(1);
  });

  it("answers a wrong code with the wrong-code line and signs nobody in", async () => {
    await postAuth("/api/auth/code", { phone: "+15550100000" }, browser);
    expect(
      await postAuth("/api/auth/verify", { code: "123456" }, browser),
    ).toEqual({ ok: false, message: "That's not it. Try once more." });
    expect(await userCount()).toBe(0);
  });

  it("lets the right code through after a wrong one", async () => {
    await postAuth("/api/auth/code", { phone: "+15550100000" }, browser);
    await postAuth("/api/auth/verify", { code: "123456" }, browser);
    expect(
      await postAuth("/api/auth/verify", { code: "000000" }, browser),
    ).toEqual({ ok: true, next: "/welcome/install" });
  });
});
