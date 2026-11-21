import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { NextRequest } from "next/server";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { toE164, type E164 } from "@/lib/phone";
import { routeKind, type RouteKind } from "@/server/auth";
import { makeDeps } from "@/server/deps";
import { supabaseAuth } from "@/server/supabase/server";
import { TEST_SESSION_COOKIE } from "@/server/testAuth";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { FakeJar } from "@/test/fakes/jar";
import { proxy } from "./proxy";

vi.mock("@/server/deps", () => ({ makeDeps: vi.fn() }));

const SUPABASE_ENV = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
};
const SB_COOKIE = "sb-example-auth-token";
const USER_ID = "8f0e7c52-4a8b-4f43-9d0c-1f2e3d4c5b6a";
const phone = toE164("(555) 123-4567") as E164;

let testDeps: TestDeps;

beforeAll(async () => {
  testDeps = await makeTestDeps();
});

beforeEach(() => {
  vi.stubGlobal("fetch", () => {
    throw new Error("tests must not call the network");
  });
  withTestAuth();
});

afterEach(() => vi.unstubAllGlobals());

function withTestAuth() {
  vi.mocked(makeDeps).mockResolvedValue(testDeps);
}

function withSupabaseAuth(fetchImpl: typeof fetch) {
  vi.mocked(makeDeps).mockResolvedValue({
    ...testDeps,
    auth: (jar) => supabaseAuth(jar, SUPABASE_ENV, fetchImpl),
  });
}

function request(path: string, cookie?: string) {
  return new NextRequest(
    `https://coo.test${path}`,
    cookie ? { headers: { cookie } } : {},
  );
}

async function testSessionCookie(): Promise<string> {
  const jar = new FakeJar();
  await testDeps.auth(jar).verifyCode(phone, "000000");
  const value = jar.cookies.get(TEST_SESSION_COOKIE)?.value;
  if (!value) throw new Error("test sign-in failed");
  return value;
}

async function forgedSessionCookie(): Promise<string> {
  const value = await testSessionCookie();
  const sigStart = value.lastIndexOf(".") + 1;
  const flipped = value[sigStart] === "A" ? "B" : "A";
  return `${TEST_SESSION_COOKIE}=${value.slice(0, sigStart)}${flipped}${value.slice(sigStart + 1)}`;
}

const base64url = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

function expiredSupabaseCookie(): string {
  const access = [
    base64url({ alg: "HS256", typ: "JWT" }),
    base64url({
      sub: USER_ID,
      exp: 1,
      aud: "authenticated",
      role: "authenticated",
    }),
    "c2ln",
  ].join(".");
  const session = {
    access_token: access,
    refresh_token: "refresh-token",
    expires_in: 3600,
    expires_at: 1,
    token_type: "bearer",
    user: { id: USER_ID, aud: "authenticated", role: "authenticated" },
  };
  return `${SB_COOKIE}=base64-${base64url(session)}`;
}

const refreshRejected: typeof fetch = async (input) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.pathname !== "/auth/v1/token") {
    throw new Error(`unexpected request to ${url.pathname}`);
  }
  return Response.json(
    {
      code: 400,
      error_code: "refresh_token_not_found",
      msg: "Invalid Refresh Token",
    },
    { status: 400 },
  );
};

function expectWelcomeRedirect(res: Response) {
  expect(res.status).toBe(307);
  expect(res.headers.get("location")).toBe("https://coo.test/welcome");
}

function expectPassThrough(res: Response) {
  expect(res.status).toBeLessThan(300);
  expect(res.headers.get("location")).toBeNull();
  expect(res.headers.get("x-middleware-next")).toBe("1");
}

type SignedOut = {
  label: string;
  auth: "test" | "supabase";
  cookie: () => Promise<string | undefined>;
};

const SIGNED_OUT: SignedOut[] = [
  { label: "no cookie", auth: "test", cookie: async () => undefined },
  { label: "a forged test session", auth: "test", cookie: forgedSessionCookie },
  {
    label: "a garbage Supabase cookie",
    auth: "supabase",
    cookie: async () => `${SB_COOKIE}=garbage`,
  },
];

async function signedOutRequest(path: string, visitor: SignedOut) {
  if (visitor.auth === "supabase") withSupabaseAuth(refreshRejected);
  return proxy(request(path, await visitor.cookie()));
}

describe("proxy for a signed-out visitor", () => {
  describe.each(SIGNED_OUT)("with $label", (visitor) => {
    it.each(["/", "/flights", "/%66lights", "/api%E0"])(
      "redirects %s to /welcome",
      async (path) => {
        expectWelcomeRedirect(await signedOutRequest(path, visitor));
      },
    );

    it.each([
      "/welcome",
      "/sign-in/verify",
      "/dev/birds",
      "/join/k3x9",
      "/%77elcome",
      "/join/k3x%39",
    ])("lets public page %s through", async (path) => {
      expectPassThrough(await signedOutRequest(path, visitor));
    });

    it.each([
      "/api",
      "/api/sync",
      "/api/cron/tick",
      "/%61pi/onboarding",
      "/api%2Fonboarding",
      "/%61%70%69",
    ])("never redirects %s", async (path) => {
      expectPassThrough(await signedOutRequest(path, visitor));
    });
  });

  it("redirects an expired Supabase session whose refresh fails and clears its cookies", async () => {
    withSupabaseAuth(refreshRejected);
    const res = await proxy(request("/flights", expiredSupabaseCookie()));

    expectWelcomeRedirect(res);
    const cleared = res.headers
      .getSetCookie()
      .filter((c) => c.startsWith("sb-"));
    expect(cleared.length).toBeGreaterThan(0);
    for (const cookie of cleared) {
      expect(cookie).toMatch(/^sb-[^=]+=;/);
      expect(cookie).toMatch(/Max-Age=0/i);
    }
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
  });
});

describe("proxy for a signed-in visitor", () => {
  it("lets an app page through", async () => {
    const cookie = `${TEST_SESSION_COOKIE}=${await testSessionCookie()}`;
    expectPassThrough(await proxy(request("/flights", cookie)));
  });
});

const APP_DIR = join(import.meta.dirname, "app");

const OUTSIDE_GROUPS: Record<string, RouteKind> = {
  "/": "app",
  "/dev": "public",
  "/dev/birds": "public",
  "/dev/components": "public",
  "/dev/map": "public",
};

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

function routeOf(file: string) {
  const segments = file.split(sep).slice(0, -1);
  const group = segments.find((s) => /^\(.+\)$/.test(s))?.slice(1, -1);
  const url = `/${segments
    .filter((s) => !/^\(.+\)$/.test(s))
    .map((s) => (/^\[.+\]$/.test(s) ? "sample" : s))
    .join("/")}`;
  return { group, url };
}

function expectedKind(group: string | undefined, url: string) {
  if (group === "app" || group === "public") return group;
  return OUTSIDE_GROUPS[url];
}

describe("routeKind agrees with the src/app layout", () => {
  const files = walk(APP_DIR).map((file) => relative(APP_DIR, file));
  const named = (name: string) =>
    files.filter((f) => f.split(sep).at(-1) === name);
  const pages = named("page.tsx");
  const routes = named("route.ts");

  it("finds pages to check", () => {
    expect(pages.length).toBeGreaterThan(0);
  });

  it("gives each page the kind of its route group or the outside-group table", () => {
    const actual = pages.map((file) => {
      const { url } = routeOf(file);
      return { file, url, kind: routeKind(url) };
    });
    const expected = pages.map((file) => {
      const { group, url } = routeOf(file);
      return { file, url, kind: expectedKind(group, url) };
    });
    expect(actual).toEqual(expected);
  });

  it("treats each route handler as api", () => {
    const actual = routes.map((file) => ({
      file,
      kind: routeKind(routeOf(file).url),
    }));
    expect(actual).toEqual(routes.map((file) => ({ file, kind: "api" })));
  });
});
