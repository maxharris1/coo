import { describe, expect, it } from "vitest";
import { bugReportInput } from "@/server/services/bugReports";
import { ERRORS } from "./copy";
import {
  type BugContext,
  type SendFailure,
  createReportSender,
  readContext,
} from "./submit";

type Seen = { path: string; init: RequestInit };
type Reply = { status: number; body?: unknown } | "throw";

function fakeFetch(...replies: Reply[]) {
  const seen: Seen[] = [];
  const fetchImpl = (async (path: string, init: RequestInit) => {
    seen.push({ path, init });
    const reply = replies[Math.min(seen.length, replies.length) - 1];
    if (reply === "throw") throw new TypeError("Failed to fetch");
    return new Response(
      reply.body === undefined ? null : JSON.stringify(reply.body),
      { status: reply.status },
    );
  }) as unknown as typeof fetch;
  const sent = () =>
    seen.map((s) => JSON.parse(String(s.init.body)) as Record<string, unknown>);
  return { fetchImpl, seen, sent };
}

function keys() {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
}

const created = { status: 201, body: { id: "r1" } };
const failure = (status: number, code: string) => ({
  status,
  body: { error: { code, message: "no" } },
});

const context: BugContext = {
  route: "/flights",
  standalone: false,
  viewport: { w: 390, h: 844 },
  timeZone: "America/New_York",
};

function fakeWindow(over: { standalone?: boolean; navigator?: object } = {}) {
  return {
    innerWidth: 390.4,
    innerHeight: 843.6,
    matchMedia: (query: string) =>
      ({
        matches: query === "(display-mode: standalone)" && !!over.standalone,
      }) as MediaQueryList,
    navigator: (over.navigator ?? {}) as Navigator,
  };
}

describe("readContext", () => {
  it("has exactly route, standalone, rounded viewport and time zone", () => {
    const ctx = readContext("/flights", fakeWindow());
    expect(Object.keys(ctx).sort()).toEqual([
      "route",
      "standalone",
      "timeZone",
      "viewport",
    ]);
    expect(ctx).toEqual({
      route: "/flights",
      standalone: false,
      viewport: { w: 390, h: 844 },
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  });

  it("is standalone by display mode or by navigator.standalone", () => {
    expect(readContext("/", fakeWindow({ standalone: true })).standalone).toBe(
      true,
    );
    expect(
      readContext("/", fakeWindow({ navigator: { standalone: true } }))
        .standalone,
    ).toBe(true);
  });

  it("never sends a zero viewport the server would refuse", () => {
    const win = { ...fakeWindow(), innerWidth: 0, innerHeight: 0.2 };
    expect(readContext("/", win).viewport).toEqual({ w: 1, h: 1 });
  });
});

describe("createReportSender", () => {
  it("posts one trimmed report that the server's schema accepts", async () => {
    const { fetchImpl, seen, sent } = fakeFetch(created);
    const sender = createReportSender(fetchImpl, keys());

    expect(await sender.send("  the bird stayed home \n", context)).toEqual({
      ok: true,
    });

    expect(seen).toHaveLength(1);
    expect(seen[0].path).toBe("/api/bug-reports");
    expect(seen[0].init.method).toBe("POST");
    expect(new Headers(seen[0].init.headers).get("content-type")).toBe(
      "application/json",
    );
    const [payload] = sent();
    expect(Object.keys(payload).sort()).toEqual([
      "body",
      "clientKey",
      "context",
    ]);
    expect(payload.body).toBe("the bird stayed home");
    expect(payload.context).toEqual(context);
    expect(payload.context).not.toHaveProperty("userAgent");
    expect(payload.context).not.toHaveProperty("build");
    expect(payload.context).not.toHaveProperty("appEnv");
    expect(bugReportInput.safeParse(payload).success).toBe(true);
  });

  it("sends a real context that the server's schema accepts", async () => {
    const { fetchImpl, sent } = fakeFetch(created);
    await createReportSender(fetchImpl, keys()).send(
      "x",
      readContext("/flights", fakeWindow()),
    );
    expect(bugReportInput.safeParse(sent()[0]).success).toBe(true);
  });

  it.each<[string, SendFailure, Reply]>([
    ["a 429", "rate_limited", failure(429, "rate_limited")],
    ["a 429 with no body", "rate_limited", { status: 429 }],
    ["invalid", "invalid", failure(400, "invalid")],
    ["a network failure", "offline", "throw"],
    ["an internal error", "unknown", failure(500, "internal")],
    ["an unreadable body", "unknown", { status: 502 }],
  ])("maps %s to %s", async (_, reason, reply) => {
    const { fetchImpl } = fakeFetch(reply);
    const result = await createReportSender(fetchImpl, keys()).send(
      "x",
      context,
    );
    expect(result).toEqual({ ok: false, reason });
  });

  it("retries with the same clientKey and makes a new one after a success", async () => {
    const { fetchImpl, sent } = fakeFetch(
      "throw",
      failure(429, "rate_limited"),
      created,
      created,
    );
    const sender = createReportSender(fetchImpl, keys());

    await sender.send("x", context);
    await sender.send("x", context);
    await sender.send("x", context);
    await sender.send("y", context);

    const used = sent().map((p) => p.clientKey);
    expect(used[1]).toBe(used[0]);
    expect(used[2]).toBe(used[0]);
    expect(used[3]).not.toBe(used[0]);
  });

  it("gives each new sender its own clientKey", async () => {
    const newKey = keys();
    const { fetchImpl, sent } = fakeFetch(created);
    await createReportSender(fetchImpl, newKey).send("x", context);
    await createReportSender(fetchImpl, newKey).send("x", context);
    const [first, second] = sent().map((p) => p.clientKey);
    expect(first).not.toBe(second);
  });

  it("makes one request for two quick sends", async () => {
    const { fetchImpl, seen } = fakeFetch(created);
    const sender = createReportSender(fetchImpl, keys());

    const first = sender.send("x", context);
    const second = sender.send("x", context);

    expect(second).toBeNull();
    expect(await first).toEqual({ ok: true });
    expect(seen).toHaveLength(1);
  });

  it("can send again once the first send settles", async () => {
    const { fetchImpl, seen } = fakeFetch("throw", created);
    const sender = createReportSender(fetchImpl, keys());

    expect(await sender.send("x", context)).toEqual({
      ok: false,
      reason: "offline",
    });
    expect(await sender.send("x", context)).toEqual({ ok: true });
    expect(seen).toHaveLength(2);
  });
});

describe("ERRORS", () => {
  it("has a calm line for every failure", () => {
    expect(ERRORS).toEqual({
      rate_limited: "That is a lot of reports. Try again in an hour.",
      invalid: "That will not fit. Keep it under 2000 characters.",
      offline:
        "You are offline. Birds keep flying. Try again when you are back.",
      unknown: "Something went sideways. Nothing was lost. Try again.",
    });
  });
});
