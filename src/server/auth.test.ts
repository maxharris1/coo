import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toE164, type E164 } from "@/lib/phone";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { FakeJar } from "@/test/fakes/jar";
import { requireOnboarded, requireUser, routeKind } from "./auth";
import { AppError } from "./errors";
import { TEST_SESSION_COOKIE } from "./testAuth";

const phone = toE164("(555) 123-4567") as E164;

let deps: TestDeps;
let jar: FakeJar;

function session() {
  return { auth: deps.auth(jar), db: deps.db };
}

async function signIn(): Promise<string> {
  const id = await deps.auth(jar).verifyCode(phone, "000000");
  if (!id) throw new Error("test sign-in failed");
  return id;
}

async function addProfile(id: string, onboardedAt: Date | null) {
  await deps.db.query(
    `insert into profiles (id, name, handle, invite_code, onboarded_at)
     values ($1, 'Max', 'max', 'invite-max', $2)`,
    [id, onboardedAt],
  );
}

async function rejection(promise: Promise<unknown>): Promise<AppError> {
  const err = await promise.then(
    () => {
      throw new Error("expected a rejection");
    },
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AppError);
  return err as AppError;
}

describe("with a session store", () => {
  beforeEach(async () => {
    vi.stubGlobal("fetch", () => {
      throw new Error("tests must not call the network");
    });
    deps = await makeTestDeps();
    jar = new FakeJar();
  });

  afterEach(() => vi.unstubAllGlobals());

  describe("requireUser", () => {
    it("rejects an empty jar with 401 unauthenticated", async () => {
      const err = await rejection(requireUser(session()));
      expect(err.code).toBe("unauthenticated");
      expect(err.status).toBe(401);
    });

    it("rejects a session cookie whose signature does not verify", async () => {
      await signIn();
      const cookie = jar.cookies.get(TEST_SESSION_COOKIE)!;
      const dot = cookie.value.lastIndexOf(".");
      const sig = Buffer.from(cookie.value.slice(dot + 1), "base64url");
      sig[0] ^= 0xff;
      const flipped =
        cookie.value.slice(0, dot + 1) + sig.toString("base64url");
      jar.cookies.set(TEST_SESSION_COOKIE, { ...cookie, value: flipped });
      const err = await rejection(requireUser(session()));
      expect(err.code).toBe("unauthenticated");
    });

    it("returns the user with a null profile before onboarding starts", async () => {
      const id = await signIn();
      expect(await requireUser(session())).toEqual({
        userId: id,
        profile: null,
      });
    });

    it("returns the caller's own profile", async () => {
      const id = await signIn();
      await addProfile(id, null);
      const caller = await requireUser(session());
      expect(caller.userId).toBe(id);
      expect(caller.profile).toMatchObject({
        id,
        handle: "max",
        onboarded_at: null,
      });
    });
  });

  describe("requireOnboarded", () => {
    it("rejects a signed-out caller with unauthenticated", async () => {
      const err = await rejection(requireOnboarded(session()));
      expect(err.code).toBe("unauthenticated");
    });

    it("rejects a caller with no profile with 409 not_onboarded", async () => {
      await signIn();
      const err = await rejection(requireOnboarded(session()));
      expect(err.code).toBe("not_onboarded");
      expect(err.status).toBe(409);
    });

    it("rejects a caller whose profile is unfinished with not_onboarded", async () => {
      const id = await signIn();
      await addProfile(id, null);
      const err = await rejection(requireOnboarded(session()));
      expect(err.code).toBe("not_onboarded");
    });

    it("resolves an onboarded caller with their profile", async () => {
      const id = await signIn();
      const at = new Date(Date.UTC(2026, 10, 19, 12));
      await addProfile(id, at);
      const caller = await requireOnboarded(session());
      expect(caller.userId).toBe(id);
      expect(caller.profile.id).toBe(id);
      expect(caller.profile.onboarded_at).toEqual(at);
    });
  });
});

describe("routeKind", () => {
  it.each([
    ["/api", "api"],
    ["/api/", "api"],
    ["/api/sync", "api"],
    ["/api/cron/tick", "api"],
    ["/apiary", "app"],
    ["/welcome", "public"],
    ["/offline", "public"],
    ["/offline/x", "app"],
    ["/sign-in", "public"],
    ["/sign-in/verify", "public"],
    ["/privacy", "public"],
    ["/terms", "public"],
    ["/privacy/x", "app"],
    ["/dev/birds", "public"],
    ["/dev/components", "public"],
    ["/dev", "public"],
    ["/join/k3x9", "public"],
    ["/b/amber-gull-42", "public"],
    ["/join", "app"],
    ["/b", "app"],
    ["/bird", "app"],
    ["/developer", "app"],
    ["/", "app"],
    ["/flights", "app"],
    ["/welcome/install", "app"],
    ["/welcome/bird", "app"],
    ["/welcome/loft", "app"],
    ["/sign-in/elsewhere", "app"],
    ["/no-such-page", "app"],
    ["/join/", "app"],
    ["/b/", "app"],
    ["/dev/", "app"],
    ["/join/k3x9/settings", "app"],
    ["/b/amber-gull-42/claim", "app"],
    ["/dev/birds/extra", "app"],
    ["/join//k3x9", "app"],
    ["/%61pi/onboarding", "api"],
    ["/api%2Fonboarding", "api"],
    ["/%61%70%69", "api"],
    ["/%2561pi", "app"],
    ["/api/%E0", "api"],
    ["/api%E0", "app"],
    ["/%77elcome", "public"],
    ["/join/k3x%39", "public"],
    ["/join%2Fk3x9", "public"],
    ["/%66lights", "app"],
  ] as const)("%s is %s", (path, kind) => {
    expect(routeKind(path)).toBe(kind);
  });
});
