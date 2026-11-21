import { beforeEach, describe, expect, it } from "vitest";
import { toE164, type E164 } from "@/lib/phone";
import type { UserId } from "@/server/ports/auth";
import { onboard } from "@/server/services/onboarding";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { FakeJar } from "@/test/fakes/jar";
import { joinState } from "./joinState";

let deps: TestDeps;

beforeEach(async () => {
  deps = await makeTestDeps();
});

async function signedIn(number: string) {
  const jar = new FakeJar();
  const id = await deps
    .auth(jar)
    .verifyCode(toE164(number) as E164, "000000");
  if (!id) throw new Error("test sign-in failed");
  return { id, session: { auth: deps.auth(jar), db: deps.db } };
}

const signedOut = () => ({ auth: deps.auth(new FakeJar()), db: deps.db });

async function inviter(number: string, name: string) {
  const { id } = await signedIn(number);
  const { me } = await onboard(deps, id as UserId, {
    timezone: "America/New_York",
    bird: { name: "Gerald", look: "gerald", pronoun: "he" },
    name,
  });
  return me.inviteCode;
}

describe("joinState", () => {
  it("names the inviter to someone signed out", async () => {
    const code = await inviter("(555) 765-4321", "Priya");
    expect(await joinState(signedOut(), code)).toEqual({
      name: "Priya",
      signedIn: false,
    });
  });

  it("knows when the visitor is signed in", async () => {
    const code = await inviter("(555) 765-4321", "Priya");
    const { session } = await signedIn("(555) 123-4567");
    expect(await joinState(session, code)).toEqual({
      name: "Priya",
      signedIn: true,
    });
  });

  it("turns an unknown code into Next's not-found", async () => {
    await inviter("(555) 765-4321", "Priya");
    await expect(
      joinState(signedOut(), "nobody-AAAAAAAAAAAA"),
    ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  });

  it("turns a code with a NUL byte into not-found", async () => {
    await expect(
      joinState(signedOut(), "priya-AAAA\0AAAAAAA"),
    ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
  });

  it.each([
    ["too many characters", `${"p".repeat(21)}-AAAAAAAAAAAA`],
    ["characters outside the invite charset", "priya-AAAA%AAAAAAA"],
  ])("never resolves a stored code with %s", async (_, code) => {
    const [{ id }] = await deps.db.query<{ id: string }>(
      "insert into auth.users default values returning id",
    );
    await deps.db.query(
      "insert into profiles (id, name, handle, invite_code) values ($1, 'Priya', 'priya', $2)",
      [id, code],
    );
    await expect(joinState(signedOut(), code)).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
  });
});
