import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "@/lib/config";
import { AppError } from "@/server/errors";
import type { UserId } from "@/server/ports/auth";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { seedWorld, type World } from "@/test/seedWorld";
import {
  bugReportInput,
  buildLabel,
  cleanRoute,
  cleanUserAgent,
  fileBugReport,
  type BugReportInput,
  type ServerContext,
} from "./bugReports";

const HOUR_MS = 3_600_000;

describe("cleanRoute", () => {
  it.each([
    ["/flights/123?x=1#y", "/flights/123"],
    ["/b/SECRETTOKEN", "/b/[slug]"],
    ["/join/ABC123", "/join/[code]"],
    ["not-a-path", "unknown"],
    ["/b/TOKEN/x?y", "/b/[slug]/x"],
    ["/join/ABC#z", "/join/[code]"],
    ["/loft\u0000/x", "/loft/x"],
    ["", "unknown"],
    ["?/b/x", "unknown"],
    ["/b", "/b"],
    ["/loft/\ud83d", "/loft/\ufffd"],
  ])("%j becomes %j", (raw, cleaned) => {
    expect(cleanRoute(raw)).toBe(cleaned);
  });

  it("cuts 500 characters to 200", () => {
    const cleaned = cleanRoute("/" + "a".repeat(499));
    expect(cleaned).toHaveLength(200);
    expect(cleaned).toBe("/" + "a".repeat(199));
  });
});

describe("server-set context", () => {
  it("caps the user agent at 300 characters with control characters removed", () => {
    const cleaned = cleanUserAgent("Mozilla\t\u0007" + "x".repeat(400));
    expect(cleaned).toHaveLength(300);
    expect(cleaned).not.toMatch(/[\u0000-\u001f\u007f]/);
    expect(cleaned.startsWith("Mozillax")).toBe(true);
    expect(cleanUserAgent(null)).toBe("");
  });

  it("labels the build with 12 characters of the commit or dev", () => {
    expect(buildLabel("0123456789abcdef0123456789abcdef01234567")).toBe(
      "0123456789ab",
    );
    expect(buildLabel(undefined)).toBe("dev");
    expect(buildLabel("")).toBe("dev");
  });

  it.each([
    ["context.userAgent", {}, { userAgent: "x" }],
    ["context.build", {}, { build: "abc" }],
    ["top-level userAgent", { userAgent: "x" }, {}],
    ["top-level build", { build: "abc" }, {}],
  ])("refuses a browser-sent %s", (_name, top, context) => {
    const base = validInput();
    const input = {
      ...base,
      ...top,
      context: { ...base.context, ...context },
    };
    expect(bugReportInput.safeParse(input).success).toBe(false);
  });

  it.each([
    ["a NUL", "America/New\u0000York"],
    ["a lone surrogate", "America/\ud83d"],
  ])("refuses a time zone with %s", (_name, timeZone) => {
    const input = validInput();
    input.context.timeZone = timeZone;
    expect(bugReportInput.safeParse(input).success).toBe(false);
  });

  it("accepts a valid report", () => {
    expect(bugReportInput.safeParse(validInput()).success).toBe(true);
  });
});

let deps: TestDeps;
let world: World;
let max: UserId;
let priya: UserId;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
  max = world.max.id as UserId;
  priya = world.priya.id as UserId;
});

afterEach(() => vi.restoreAllMocks());

function validInput(overrides: Partial<BugReportInput> = {}): BugReportInput {
  return {
    clientKey: randomUUID(),
    body: "The loft map went blank",
    context: {
      route: "/loft",
      standalone: true,
      viewport: { w: 390, h: 844 },
      timeZone: "America/New_York",
    },
    ...overrides,
  };
}

const server: ServerContext = {
  userAgent: cleanUserAgent("Mozilla/5.0 (iPhone)"),
  build: buildLabel("0123456789abcdef0123"),
  appEnv: "test",
};

const file = (me: UserId, input = validInput()) =>
  fileBugReport(deps, me, bugReportInput.parse(input), server);

async function rowsFor(userId: string) {
  return deps.db.query<{
    id: string;
    user_id: string;
    body: string;
    context: Record<string, unknown>;
  }>("select id, user_id, body, context from bug_reports where user_id = $1", [
    userId,
  ]);
}

async function countRows(table: string): Promise<number> {
  const [{ n }] = await deps.db.query<{ n: number }>(
    `select count(*)::int as n from ${table}`,
  );
  return n;
}

async function slotsUsed(userId: string): Promise<number> {
  const [row] = await deps.db.query<{ count: number }>(
    "select count from rate_limits where key = $1",
    [`bug-reports:${userId}`],
  );
  return row?.count ?? 0;
}

const isRateLimited = (error: unknown) =>
  error instanceof AppError && error.code === "rate_limited";

describe("fileBugReport", () => {
  it("stores the cleaned route and the server-set context", async () => {
    const input = validInput();
    input.context.route = "/b/SECRETTOKEN?t=1";
    const { id } = await file(max, input);

    const [row] = await rowsFor(max);
    expect(row.id).toBe(id);
    expect(row.context).toEqual({
      route: "/b/[slug]",
      standalone: true,
      viewport: { w: 390, h: 844 },
      timeZone: "America/New_York",
      userAgent: "Mozilla/5.0 (iPhone)",
      build: "0123456789ab",
      appEnv: "test",
    });
    expect(JSON.stringify(row)).not.toContain("SECRETTOKEN");
  });

  it("stores a route cut through an emoji and a context with every field at its maximum", async () => {
    const input = validInput();
    input.context.route = "/b/x/" + "\u00e9".repeat(189) + "\u{1F426}";
    input.context.timeZone = "\u00e9".repeat(64);
    input.context.viewport = { w: 10000, h: 10000 };
    await fileBugReport(deps, max, bugReportInput.parse(input), {
      ...server,
      userAgent: cleanUserAgent("\u00e9".repeat(400)),
    });

    const [row] = await rowsFor(max);
    expect(row.context.route).toBe("/b/[slug]/" + "\u00e9".repeat(189));
    expect(row.context.userAgent).toBe("\u00e9".repeat(300));
  });

  it("stores a 300-character user agent", async () => {
    await fileBugReport(deps, max, bugReportInput.parse(validInput()), {
      ...server,
      userAgent: cleanUserAgent("U".repeat(1000)),
    });
    const [row] = await rowsFor(max);
    expect(row.context.userAgent).toBe("U".repeat(300));
  });

  it("returns the same id for a repeated clientKey without a new row or slot", async () => {
    const input = validInput();
    const first = await file(max, input);
    const second = await file(max, input);

    expect(second.id).toBe(first.id);
    expect(await rowsFor(max)).toHaveLength(1);
    expect(await slotsUsed(max)).toBe(1);
  });

  it("does not count replays against the limit", async () => {
    const limit = config.game.limits.bugReportsPerHour;
    const first = validInput();
    await file(max, first);
    for (let i = 1; i < limit; i++) await file(max, validInput());

    await expect(file(max, first)).resolves.toBeDefined();
    expect(await rowsFor(max)).toHaveLength(limit);
  });

  it("gives another user with the same clientKey their own row", async () => {
    const clientKey = randomUUID();
    const mine = await file(
      max,
      validInput({ clientKey, body: "Max's private words" }),
    );
    const theirs = await file(
      priya,
      validInput({ clientKey, body: "Priya's own words" }),
    );

    expect(theirs.id).not.toBe(mine.id);
    expect(JSON.stringify(theirs)).not.toContain(mine.id);
    expect(JSON.stringify(theirs)).not.toContain("Max's private words");
    const [priyaRow] = await rowsFor(priya);
    expect(priyaRow).toMatchObject({
      id: theirs.id,
      user_id: priya,
      body: "Priya's own words",
    });
    expect(await rowsFor(max)).toHaveLength(1);
    expect(await countRows("bug_reports")).toBe(2);
  });

  it("refuses the report past the hourly limit from config, per user, until the hour passes", async () => {
    const limit = config.game.limits.bugReportsPerHour;
    expect(limit).toBe(5);
    for (let i = 0; i < limit; i++) await file(max);

    const refused = await file(max).catch((error: unknown) => error);
    expect(isRateLimited(refused)).toBe(true);
    expect(await rowsFor(max)).toHaveLength(limit);

    await expect(file(priya)).resolves.toBeDefined();

    deps.clock.advance(HOUR_MS);
    await expect(file(max)).resolves.toBeDefined();
    expect(await rowsFor(max)).toHaveLength(limit + 1);
  });

  it("sends nothing and writes no notification or event", async () => {
    const notificationsBefore = await countRows("notifications");
    const eventsBefore = await countRows("events");

    await file(max);

    expect(await countRows("notifications")).toBe(notificationsBefore);
    expect(await countRows("events")).toBe(eventsBefore);
    expect(deps.push.sent).toEqual([]);
    expect(deps.sms.sent).toEqual([]);
    expect(Object.keys(deps)).not.toContain("email");
  });

  it("never logs the body, route or user agent", async () => {
    const lines: string[] = [];
    for (const method of ["log", "info", "warn", "error", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        lines.push(args.map(String).join(" "));
      });
    }
    const markers = {
      body: "BODYMARKER7781",
      route: "ROUTEMARKER7781",
      userAgent: "AGENTMARKER7781",
    };
    const input = validInput({ body: `it broke ${markers.body}` });
    input.context.route = `/loft/${markers.route}`;
    const marked = { ...server, userAgent: `Mozilla ${markers.userAgent}` };
    const limit = config.game.limits.bugReportsPerHour;

    const { id } = await fileBugReport(
      deps,
      max,
      bugReportInput.parse(input),
      marked,
    );
    await fileBugReport(deps, max, bugReportInput.parse(input), marked);
    for (let i = 1; i < limit; i++) await file(max);
    const refused = await fileBugReport(
      deps,
      max,
      bugReportInput.parse({ ...input, clientKey: randomUUID() }),
      marked,
    ).catch((error: unknown) => error);
    expect(isRateLimited(refused)).toBe(true);

    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      for (const marker of Object.values(markers)) {
        expect(line).not.toContain(marker);
      }
    }
    const filed = lines
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .find((entry) => entry.reportId === id);
    expect(Object.keys(filed ?? {}).sort()).toEqual([
      "event",
      "level",
      "reportId",
      "userId",
    ]);
  });
});
