import { NextRequest } from "next/server";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { log } from "@/server/log";
import { createJsonRoute } from "@/server/http";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { authRoutes } from "./handlers";

const FRAGMENTS = [
  "5551234567",
  "4155550123",
  "555-123-4567",
  "1234567",
  "5550123",
];

let deps: TestDeps;
let spies: MockInstance[];
let cookie: string;
let bodies: string[];

beforeEach(async () => {
  vi.stubGlobal("fetch", () => {
    throw new Error("tests must not call the network");
  });
  deps = await makeTestDeps();
  spies = [
    vi.spyOn(log, "info"),
    vi.spyOn(log, "warn"),
    vi.spyOn(log, "error"),
    vi.spyOn(console, "log").mockImplementation(() => {}),
    vi.spyOn(console, "warn").mockImplementation(() => {}),
    vi.spyOn(console, "error").mockImplementation(() => {}),
  ];
  cookie = "";
  bodies = [];
});

async function send(
  route: (req: NextRequest) => Promise<Response>,
  req: NextRequest,
) {
  const res = await route(req);
  const jar = new Map(
    cookie
      .split("; ")
      .filter(Boolean)
      .map((c) => c.split("=", 2) as [string, string]),
  );
  for (const c of res.headers.getSetCookie()) {
    const [name, value] = c.split(";")[0]!.split("=", 2) as [string, string];
    if (value === "" || /max-age=0/i.test(c)) jar.delete(name);
    else jar.set(name, value);
  }
  cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
  bodies.push(
    JSON.stringify(await res.json()),
    res.headers.get("location") ?? "",
  );
  return res.status;
}

const post = (
  route: (req: NextRequest) => Promise<Response>,
  path: string,
  body: unknown,
) =>
  send(
    route,
    new NextRequest(`https://coo.test${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(body),
    }),
  );

const get = (route: (req: NextRequest) => Promise<Response>, path: string) =>
  send(
    route,
    new NextRequest(`https://coo.test${path}`, { headers: { cookie } }),
  );

function expectNoPhoneLogged() {
  const logged = spies
    .flatMap((spy) => spy.mock.calls)
    .map((args) => JSON.stringify(args))
    .join("\n");
  const sent = bodies.join("\n");
  for (const fragment of FRAGMENTS) {
    expect(logged).not.toContain(fragment);
    expect(sent).not.toContain(fragment);
  }
}

describe("ac-4 the sign-in flow writes no phone number to any log", () => {
  it("over send, wrong code, right code, session, sign-out and session again", async () => {
    const { code, verify, session, signOut } = authRoutes(
      createJsonRoute(async () => deps),
    );
    expect(
      await post(code, "/api/auth/code", { phone: "(555) 123-4567" }),
    ).toBe(200);
    expect(await post(verify, "/api/auth/verify", { code: "123456" })).toBe(
      400,
    );
    expect(await post(verify, "/api/auth/verify", { code: "000000" })).toBe(
      200,
    );
    expect(await get(session, "/api/auth/session")).toBe(200);
    expect(await post(signOut, "/api/auth/sign-out", {})).toBe(200);
    expect(await get(session, "/api/auth/session")).toBe(401);
    expect(spies[0]).toHaveBeenCalled();
    expectNoPhoneLogged();
  });

  it("over a database failure inside session", async () => {
    const { code, verify } = authRoutes(createJsonRoute(async () => deps));
    await post(code, "/api/auth/code", { phone: "(555) 123-4567" });
    expect(await post(verify, "/api/auth/verify", { code: "000000" })).toBe(
      200,
    );
    const failing = await makeTestDeps({
      db: {
        ...deps.db,
        query: async () => {
          throw new Error("db failed for +1 (555) 123-4567");
        },
      },
    });
    const { session } = authRoutes(createJsonRoute(async () => failing));
    expect(await get(session, "/api/auth/session")).toBe(500);
    expect(spies[2]).toHaveBeenCalledOnce();
    expectNoPhoneLogged();
  });

  it("over send, wrong code and right code", async () => {
    const { code, verify } = authRoutes(createJsonRoute(async () => deps));
    expect(
      await post(code, "/api/auth/code", { phone: "(555) 123-4567" }),
    ).toBe(200);
    expect(await post(verify, "/api/auth/verify", { code: "123456" })).toBe(
      400,
    );
    expect(await post(verify, "/api/auth/verify", { code: "000000" })).toBe(
      200,
    );
    expect(spies[0]).toHaveBeenCalled();
    expectNoPhoneLogged();
  });

  it("over a number the test module rejects", async () => {
    const { code, verify } = authRoutes(createJsonRoute(async () => deps));
    expect(
      await post(code, "/api/auth/code", { phone: "+1 415 555 0123" }),
    ).toBe(200);
    expect(await post(verify, "/api/auth/verify", { code: "000000" })).toBe(
      400,
    );
    expectNoPhoneLogged();
  });

  it("over an unreadable number", async () => {
    const { code } = authRoutes(createJsonRoute(async () => deps));
    expect(await post(code, "/api/auth/code", { phone: "555-123-4567x" })).toBe(
      400,
    );
    expectNoPhoneLogged();
  });

  it("over a database failure inside verify", async () => {
    const failing = await makeTestDeps({
      db: {
        ...deps.db,
        query: async () => {
          throw new Error("db failed for +1 (555) 123-4567");
        },
        tx: async () => {
          throw new Error("db failed for +1 (555) 123-4567");
        },
      },
    });
    const { code, verify } = authRoutes(createJsonRoute(async () => failing));
    expect(
      await post(code, "/api/auth/code", { phone: "(555) 123-4567" }),
    ).toBe(200);
    expect(await post(verify, "/api/auth/verify", { code: "000000" })).toBe(
      500,
    );
    expect(spies[2]).toHaveBeenCalledOnce();
    expectNoPhoneLogged();
  });
});
