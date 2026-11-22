import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import { toE164, type E164 } from "@/lib/phone";
import { createJsonRoute } from "@/server/http";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { FakeJar } from "@/test/fakes/jar";
import { insertWaitingVisit } from "@/test/fixtures/visits";
import { seedWorld } from "@/test/seedWorld";
import { visitReplyPost } from "./post";

const PRIYA_PHONE = "+15550000002";
const ROSA_PHONE = "+15550000003";

let deps: TestDeps;
let visitId: string;

beforeEach(async () => {
  deps = await makeTestDeps();
  const world = await seedWorld(deps.db, deps.clock.now());
  ({ visitId } = await insertWaitingVisit(deps.db, world, deps.clock.now()));
});

async function signIn(phone: string) {
  const jar = new FakeJar();
  const id = await deps.auth(jar).verifyCode(toE164(phone) as E164, "000000");
  if (!id) throw new Error("test sign-in failed");
  return jar;
}

async function post(id: string, body: unknown, jar?: FakeJar) {
  const handler = visitReplyPost(createJsonRoute(async () => deps));
  const cookie = (jar?.getAll() ?? [])
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");
  const res = await handler(
    new NextRequest(`https://coo.test/api/visits/${id}/reply`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
  return { status: res.status, json: await res.json() };
}

const limits = config.game.notes.doodle;
const DOODLE = {
  v: 1,
  w: limits.width,
  h: limits.height,
  strokes: [
    {
      color: "ink",
      width: "fine",
      points: [
        [1, 2],
        [3, 4],
      ],
    },
  ],
};

const replyNotes = () =>
  deps.db.query<{ body: string; doodle: unknown }>(
    "select body, doodle from notes where reply_to is not null",
  );

const returnCount = async () =>
  (
    await deps.db.query<{ count: number }>(
      "select count(*)::int as count from flights where kind = 'return'",
    )
  )[0].count;

describe("POST /api/visits/[id]/reply", () => {
  it("refuses a request without a session as 401", async () => {
    const { status } = await post(visitId, { body: "Hi" });
    expect(status).toBe(401);
  });

  it("sends the bird home with the host's reply and returns the flight", async () => {
    const { status, json } = await post(
      visitId,
      { body: "Thanks!" },
      await signIn(PRIYA_PHONE),
    );
    expect(status).toBe(200);
    expect(json.flight).toMatchObject({ kind: "return" });
    expect(await returnCount()).toBe(1);
  });

  it("refuses someone else's visit as 404 and creates nothing (ac-2)", async () => {
    const { status, json } = await post(
      visitId,
      { body: "Hi" },
      await signIn(ROSA_PHONE),
    );
    expect(status).toBe(404);
    expect(json.error.code).toBe("not_found");
    expect(await returnCount()).toBe(0);
  });

  it("refuses a malformed id as 404", async () => {
    const { status } = await post(
      "not-a-uuid",
      { body: "Hi" },
      await signIn(PRIYA_PHONE),
    );
    expect(status).toBe(404);
  });

  it.each([[{}], [{ body: "Hi", extra: 1 }], [{ body: "   " }]])(
    "refuses the body %j as 400 invalid",
    async (body) => {
      const { status, json } = await post(
        visitId,
        body,
        await signIn(PRIYA_PHONE),
      );
      expect(status).toBe(400);
      expect(json.error.code).toBe("invalid");
      expect(await returnCount()).toBe(0);
    },
  );

  it.each<[string, { body: string; doodle?: unknown }]>([
    ["text only", { body: "Thanks!" }],
    ["a doodle only", { body: "", doodle: DOODLE }],
    ["text and a doodle", { body: "Thanks!", doodle: DOODLE }],
  ])("replies with %s", async (_, note) => {
    const { status, json } = await post(
      visitId,
      note,
      await signIn(PRIYA_PHONE),
    );
    expect(status).toBe(200);
    expect(json.flight).toMatchObject({ kind: "return" });
    expect(await replyNotes()).toEqual([
      { body: note.body, doodle: note.doodle ?? null },
    ]);
  });

  it("refuses blank text with no doodle with the send message", async () => {
    const { status, json } = await post(
      visitId,
      { body: "  " },
      await signIn(PRIYA_PHONE),
    );
    expect(status).toBe(400);
    expect(json.error).toMatchObject({
      code: "invalid",
      message: "body: write a note or add a doodle",
    });
    expect(await returnCount()).toBe(0);
    expect(await replyNotes()).toEqual([]);
  });

  it.each<[string, unknown]>([
    ["an extra key", { ...DOODLE, extra: 1 }],
    [
      "a point off the canvas",
      {
        ...DOODLE,
        strokes: [{ ...DOODLE.strokes[0], points: [[limits.width + 1, 0]] }],
      },
    ],
    ["too many bytes", { ...DOODLE, pad: "x".repeat(limits.maxBytes) }],
    ["no strokes field", "a doodle"],
  ])("refuses a doodle with %s with the send message", async (_, doodle) => {
    const { status, json } = await post(
      visitId,
      { body: "Thanks!", doodle },
      await signIn(PRIYA_PHONE),
    );
    expect(status).toBe(400);
    expect(json.error).toMatchObject({
      code: "invalid",
      message: "doodle: that doodle can't be sent",
    });
    expect(await returnCount()).toBe(0);
    expect(await replyNotes()).toEqual([]);
  });

  it("refuses a doodle on someone else's visit as 404", async () => {
    const { status } = await post(
      visitId,
      { body: "", doodle: DOODLE },
      await signIn(ROSA_PHONE),
    );
    expect(status).toBe(404);
    expect(await returnCount()).toBe(0);
  });
});
