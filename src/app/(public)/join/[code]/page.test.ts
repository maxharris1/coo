import { beforeEach, describe, expect, it, vi } from "vitest";
import { toE164, type E164 } from "@/lib/phone";
import type { UserId } from "@/server/ports/auth";
import { onboard } from "@/server/services/onboarding";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { FakeJar } from "@/test/fakes/jar";
import { generateMetadata } from "./page";

const test = vi.hoisted(() => ({ deps: undefined as unknown as TestDeps }));

vi.mock("@/server/deps", () => ({ makeDeps: async () => test.deps }));
vi.mock("@/server/supabase/cookies", () => ({
  headersJar: async () => new FakeJar(),
}));

const SUBHEAD = "Keep a pigeon and send notes, at pigeon speed.";

beforeEach(async () => {
  test.deps = await makeTestDeps();
});

async function inviter(number: string, name: string) {
  const id = await test.deps
    .auth(new FakeJar())
    .verifyCode(toE164(number) as E164, "000000");
  if (!id) throw new Error("test sign-in failed");
  const { me } = await onboard(test.deps, id as UserId, {
    timezone: "America/New_York",
    bird: { name: "Gerald", look: "gerald", pronoun: "he" },
    name,
  });
  return me.inviteCode;
}

const metadataFor = (code: string) =>
  generateMetadata({ params: Promise.resolve({ code }) });

describe("/join/[code] metadata", () => {
  it("previews the invite with the inviter's name", async () => {
    const code = await inviter("(555) 765-4321", "Priya");
    const metadata = await metadataFor(code);
    expect(metadata.title).toBe("Priya saved you a perch");
    expect(metadata.description).toBe(SUBHEAD);
    expect(metadata.openGraph?.title).toBe("Priya saved you a perch");
    expect(metadata.openGraph?.description).toBe(SUBHEAD);
  });

  it("turns an unknown code into Next's not-found", async () => {
    await inviter("(555) 765-4321", "Priya");
    await expect(metadataFor("nobody-AAAAAAAAAAAA")).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
  });
});
