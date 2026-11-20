import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireOnboarded, requireUser } from "@/server/auth";
import { createJsonRoute } from "@/server/http";
import { onboard } from "@/server/services/onboarding";
import { TEST_SESSION_COOKIE } from "@/server/testAuth";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { FakeJar } from "@/test/fakes/jar";
import { authRoutes } from "./handlers";

const ORIGIN = "https://coo.test";
const WRONG_CODE = "That's not it. Try once more.";

let deps: TestDeps;
let routes: ReturnType<typeof authRoutes>;
let cookies: Map<string, string>;

beforeEach(async () => {
  vi.stubGlobal("fetch", () => {
    throw new Error("tests must not call the network");
  });
  deps = await makeTestDeps();
  routes = authRoutes(createJsonRoute(async () => deps));
  cookies = new Map();
});

function request(path: string, body: unknown): NextRequest {
  return new NextRequest(`${ORIGIN}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: [...cookies]
        .map(([name, value]) => `${name}=${value}`)
        .join("; "),
    },
    body: JSON.stringify(body),
  });
}

async function call(
  route: (req: NextRequest) => Promise<Response>,
  path: string,
  body: unknown,
) {
  const res = (await route(request(path, body))) as Response & {
    cookies: { getAll(): { name: string; value: string; maxAge?: number }[] };
  };
  const set = res.cookies.getAll();
  for (const { name, value, maxAge } of set) {
    if (value === "" || maxAge === 0) cookies.delete(name);
    else cookies.set(name, value);
  }
  return {
    status: res.status,
    json: await res.json(),
    setCookie: res.headers.get("set-cookie") ?? "",
    set,
  };
}

const sendCode = (phone: unknown) =>
  call(routes.code, "/api/auth/code", { phone });
const verify = (code: string) =>
  call(routes.verify, "/api/auth/verify", { code });

const userCount = async () =>
  (
    await deps.db.query<{ n: number }>(
      "select count(*)::int as n from auth.users",
    )
  )[0].n;

function sessionJar(): FakeJar {
  const jar = new FakeJar();
  jar.setAll(
    [...cookies].map(([name, value]) => ({ name, value, options: {} })),
  );
  return jar;
}

async function signIn(phone = "(555) 123-4567") {
  await sendCode(phone);
  return verify("000000");
}

describe("POST /api/auth/code (ac-1)", () => {
  it("keeps the E.164 number in an HttpOnly cookie scoped to /api/auth for 10 minutes", async () => {
    const { status, json, set, setCookie } = await sendCode("(555) 123-4567");
    expect(status).toBe(200);
    expect(json.next).toBe("/sign-in/verify");
    expect(set).toContainEqual(
      expect.objectContaining({
        name: "coo_otp_phone",
        value: "+15551234567",
        httpOnly: true,
        path: "/api/auth",
        maxAge: 600,
      }),
    );
    expect(setCookie).toMatch(
      /coo_otp_phone=%2B15551234567|coo_otp_phone=\+15551234567/,
    );
    expect(setCookie).toMatch(/HttpOnly/i);
  });

  it.each([["abc"], ["123"], [""]])(
    "answers the unreadable number %j with 400 invalid and no cookie",
    async (phone) => {
      const { status, json, set } = await sendCode(phone);
      expect(status).toBe(400);
      expect(json.error.code).toBe("invalid");
      expect(set).toEqual([]);
    },
  );

  it("answers a body without a phone string with 400 invalid", async () => {
    const { status, json } = await sendCode(5551234567);
    expect(status).toBe(400);
    expect(json.error.code).toBe("invalid");
  });
});

describe("POST /api/auth/verify (ac-1)", () => {
  it("answers a wrong code with 400 and the wrong-code line, and sets no session", async () => {
    await sendCode("(555) 123-4567");
    const { status, json, set } = await verify("123456");
    expect(status).toBe(400);
    expect(json.error).toEqual({ code: "invalid", message: WRONG_CODE });
    expect(set.map((c) => c.name)).not.toContain(TEST_SESSION_COOKIE);
    expect(cookies.get("coo_otp_phone")).toBe("+15551234567");
    expect(await userCount()).toBe(0);
  });

  it("answers a verify with no pending number with 400 invalid and no session", async () => {
    const { status, json, set } = await verify("000000");
    expect(status).toBe(400);
    expect(json.error.code).toBe("invalid");
    expect(set.map((c) => c.name)).not.toContain(TEST_SESSION_COOKIE);
    expect(await userCount()).toBe(0);
  });

  it("answers a tampered pending number with 400 invalid", async () => {
    cookies.set("coo_otp_phone", "not-a-number");
    const { status, json } = await verify("000000");
    expect(status).toBe(400);
    expect(json.error.code).toBe("invalid");
    expect(await userCount()).toBe(0);
  });

  it("signs a new number in, sends it to /welcome/install and clears the pending number", async () => {
    await sendCode("(555) 123-4567");
    const { status, json, set } = await verify("000000");
    expect(status).toBe(200);
    expect(json.next).toBe("/welcome/install");
    expect(set.map((c) => c.name)).toContain(TEST_SESSION_COOKIE);
    expect(set).toContainEqual(
      expect.objectContaining({ name: "coo_otp_phone", maxAge: 0 }),
    );
    expect(cookies.has("coo_otp_phone")).toBe(false);
    expect(await userCount()).toBe(1);
  });

  it("gives the new session a caller with no profile who is not onboarded", async () => {
    await signIn();
    const session = { auth: deps.auth(sessionJar()), db: deps.db };
    const caller = await requireUser(session);
    expect(caller.profile).toBeNull();
    await expect(requireOnboarded(session)).rejects.toMatchObject({
      code: "not_onboarded",
    });
  });

  it("signs the same number in again as the same user", async () => {
    await signIn();
    const first = await requireUser({
      auth: deps.auth(sessionJar()),
      db: deps.db,
    });
    cookies.clear();
    const { json } = await signIn("555.123.4567");
    expect(json.next).toBe("/welcome/install");
    const second = await requireUser({
      auth: deps.auth(sessionJar()),
      db: deps.db,
    });
    expect(second.userId).toBe(first.userId);
    expect(await userCount()).toBe(1);
  });

  it("sends an onboarded user to /", async () => {
    await signIn();
    const { userId } = await requireUser({
      auth: deps.auth(sessionJar()),
      db: deps.db,
    });
    await onboard(deps, userId, {
      name: "Max",
      timezone: "America/New_York",
      bird: { name: "Gerald", look: "gerald", pronoun: "he" },
      secondBird: { name: "Brenda", pronoun: "she" },
    });
    await deps.db.query("update profiles set onboarded_at = $2 where id = $1", [
      userId,
      new Date(deps.clock.now()).toISOString(),
    ]);
    cookies.clear();
    const { status, json } = await signIn();
    expect(status).toBe(200);
    expect(json.next).toBe("/");
  });
});
