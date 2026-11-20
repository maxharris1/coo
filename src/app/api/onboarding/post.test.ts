import { beforeEach, describe, expect, it } from "vitest";
import { BLOCKED_NAMES } from "@/lib/blocklist";
import { toE164, type E164 } from "@/lib/phone";
import { createHandler } from "@/server/handler";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { FakeJar } from "@/test/fakes/jar";
import { onboardingPost } from "./post";

const URL_ONBOARDING = "https://coo.test/api/onboarding";
const BODY = {
  name: "Max",
  timezone: "America/New_York",
  bird: { name: "Gerald", look: "gerald", pronoun: "he" },
  secondBird: { name: "Brenda", pronoun: "she" },
};

let deps: TestDeps;
let jar: FakeJar;
let post: (req: Request) => Promise<Response>;

beforeEach(async () => {
  deps = await makeTestDeps();
  jar = new FakeJar();
  post = onboardingPost(
    createHandler(async () => deps),
    async () => jar,
  );
});

async function signIn(number: string, into = jar): Promise<string> {
  const id = await deps.auth(into).verifyCode(toE164(number) as E164, "000000");
  if (!id) throw new Error("test sign-in failed");
  return id;
}

function request(body: unknown): Request {
  return new Request(URL_ONBOARDING, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function call(body: unknown) {
  const res = await post(request(body));
  return { status: res.status, json: await res.json() };
}

const count = async (sql: string, id: string) =>
  (await deps.db.query<{ n: number }>(sql, [id]))[0].n;

describe("POST /api/onboarding (ac-4)", () => {
  it("refuses a request without a session as 401 unauthenticated and writes nothing", async () => {
    const { status, json } = await call(BODY);
    expect(status).toBe(401);
    expect(json.error.code).toBe("unauthenticated");
    expect((await deps.db.query("select 1 from profiles")).length).toBe(0);
  });

  it.each([
    ["a 31-character name", { ...BODY, name: "M".repeat(31) }, "name"],
    ["a blocklisted name", { ...BODY, name: BLOCKED_NAMES[0] }, "name"],
    [
      "a blocklisted bird name",
      {
        ...BODY,
        bird: { ...BODY.bird, name: BLOCKED_NAMES[9].replace("e", "3") },
      },
      "bird.name",
    ],
    [
      "a blocklisted roommate name",
      {
        ...BODY,
        secondBird: { name: BLOCKED_NAMES[2].toUpperCase(), pronoun: "she" },
      },
      "secondBird.name",
    ],
  ])(
    "answers %s with 400 invalid and writes nothing",
    async (_, body, field) => {
      const id = await signIn("(555) 123-4567");
      const { status, json } = await call(body);
      expect(status).toBe(400);
      expect(json.error).toEqual({ code: "invalid", message: field });
      expect(
        await count(
          "select count(*)::int as n from profiles where id = $1",
          id,
        ),
      ).toBe(0);
    },
  );

  it("answers a body that is not JSON with 400 invalid", async () => {
    await signIn("(555) 123-4567");
    const res = await post(
      new Request(URL_ONBOARDING, { method: "POST", body: "{" }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("invalid");
  });

  it("onboards the signed-in caller and returns their account", async () => {
    const id = await signIn("(555) 123-4567");
    const { status, json } = await call(BODY);
    expect(status).toBe(200);
    expect(json.me).toMatchObject({ id, name: "Max", handle: "max" });
    expect(json.birds.map((b: { name: string }) => b.name).sort()).toEqual([
      "Brenda",
      "Gerald",
    ]);
    expect(typeof json.serverNow).toBe("number");
  });

  it("onboards only the caller even when the body names someone else's id", async () => {
    const other = await signIn("(555) 765-4321", new FakeJar());
    const id = await signIn("(555) 123-4567");
    const { status, json } = await call({ ...BODY, id: other, userId: other });
    expect(status).toBe(200);
    expect(json.me.id).toBe(id);
    expect(
      await count(
        "select count(*)::int as n from profiles where id = $1",
        other,
      ),
    ).toBe(0);
    expect(
      await count(
        "select count(*)::int as n from birds where owner_id = $1",
        other,
      ),
    ).toBe(0);
  });
});
