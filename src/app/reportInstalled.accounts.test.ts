import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it } from "vitest";
import { toE164 } from "@/lib/phone";
import { createJsonRoute } from "@/server/http";
import type { UserId } from "@/server/ports/auth";
import { onboard } from "@/server/services/onboarding";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { FakeJar } from "@/test/fakes/jar";
import { authRoutes } from "./api/auth/handlers";
import { settingsPatch } from "./api/settings/patch";
import { createInstallReporter } from "./reportInstalled";

const A = "(555) 123-4567";
const B = "(555) 765-4321";

let deps: TestDeps;

beforeEach(async () => {
  deps = await makeTestDeps();
});

function browser() {
  const jsonRoute = createJsonRoute(async () => deps);
  const auth = authRoutes(jsonRoute);
  const routes: Record<string, (req: NextRequest) => Promise<Response>> = {
    "POST /api/auth/code": auth.code,
    "POST /api/auth/verify": auth.verify,
    "GET /api/auth/session": auth.session,
    "POST /api/auth/sign-out": auth.signOut,
    "PATCH /api/settings": settingsPatch(jsonRoute),
  };
  const cookies = new Map<string, string>();
  const requests: string[] = [];

  const fetchImpl = (async (path: string, init: RequestInit = {}) => {
    const method = init.method ?? "GET";
    requests.push(`${method} ${path}`);
    const handler = routes[`${method} ${path}`];
    if (!handler) throw new Error(`no route for ${method} ${path}`);
    const headers = new Headers(init.headers);
    headers.set(
      "cookie",
      [...cookies].map(([name, value]) => `${name}=${value}`).join("; "),
    );
    const res = await handler(
      new NextRequest(`https://coo.test${path}`, {
        method,
        headers,
        body: init.body,
      }),
    );
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(";");
      const [name, value] = pair.split("=");
      const expired = attrs.some((a) => /^\s*max-age=0\s*$/i.test(a));
      if (expired || value === "") cookies.delete(name.trim());
      else cookies.set(name.trim(), value);
    }
    return res;
  }) as typeof fetch;

  const post = (path: string, body: unknown) =>
    fetchImpl(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

  async function signIn(number: string) {
    expect((await post("/api/auth/code", { phone: number })).status).toBe(200);
    const res = await post("/api/auth/verify", { code: "000000" });
    expect(res.status).toBe(200);
  }

  const signOut = () => post("/api/auth/sign-out", {});
  const patches = () => requests.filter((r) => r === "PATCH /api/settings");

  const patched: string[] = [];
  let held: Promise<void> | null = null;
  let heldPatch: Promise<void> | null = null;
  let skip = 0;
  let heldFor: string | undefined;
  let release = () => {};
  const holdNextSession = (account?: string, after = 0) => {
    heldFor = account;
    skip = after;
    held = new Promise((resolve) => (release = resolve));
  };
  const holdNextPatch = () => {
    heldPatch = new Promise((resolve) => (release = resolve));
  };
  const watchedFetch = (async (path: string, init: RequestInit = {}) => {
    if (init.method === "PATCH" && heldPatch) {
      const wait = heldPatch;
      heldPatch = null;
      await wait;
    }
    const res = await fetchImpl(path, init);
    const names = async () =>
      heldFor === undefined ||
      ((await res.clone().json()) as { userId?: string }).userId === heldFor;
    if (
      path === "/api/auth/session" &&
      held &&
      (await names()) &&
      skip-- === 0
    ) {
      const wait = held;
      held = null;
      await wait;
    }
    if (init.method === "PATCH" && res.ok) {
      const { me } = (await res.clone().json()) as { me: { id: string } };
      patched.push(me.id);
    }
    return res;
  }) as typeof fetch;
  const patchesFor = (id: string) => patched.filter((p) => p === id).length;

  return {
    fetchImpl,
    signIn,
    signOut,
    patches,
    watchedFetch,
    holdNextSession,
    holdNextPatch,
    release: () => {
      held = null;
      heldPatch = null;
      release();
    },
    patchesFor,
  };
}

async function onboarded(number: string) {
  const jar = new FakeJar();
  const id = (await deps
    .auth(jar)
    .verifyCode(toE164(number)!, "000000")) as UserId;
  await onboard(deps, id, {
    timezone: "America/New_York",
    name: number,
    bird: { name: "Gerald", look: "gerald", pronoun: "he" },
  });
  await deps.db.query(
    "update profiles set onboarded_at = to_timestamp($2 / 1000.0) where id = $1",
    [id, deps.clock.now()],
  );
  return id;
}

async function installed(id: UserId) {
  const [row] = await deps.db.query<{ installed: boolean }>(
    "select installed from profiles where id = $1",
    [id],
  );
  return row.installed;
}

describe("the installed reporter across accounts", () => {
  it("records standalone mode for each account that signs in during one session", async () => {
    const a = await onboarded(A);
    const b = await onboarded(B);
    const { fetchImpl, signIn, patches } = browser();
    const report = createInstallReporter();

    await signIn(A);
    await report(true, fetchImpl);
    await signIn(B);
    await report(true, fetchImpl);

    expect(await installed(a)).toBe(true);
    expect(await installed(b)).toBe(true);
    expect(patches()).toHaveLength(2);
  });

  it("reports for a new sign-in after a sign-out", async () => {
    const a = await onboarded(A);
    const b = await onboarded(B);
    const { fetchImpl, signIn, signOut, patches } = browser();
    const report = createInstallReporter();

    await signIn(A);
    await report(true, fetchImpl);
    await signOut();
    await report(true, fetchImpl);
    await signIn(B);
    await report(true, fetchImpl);

    expect(await installed(a)).toBe(true);
    expect(await installed(b)).toBe(true);
    expect(patches()).toHaveLength(2);
  });

  it("never reports the same account twice, even after switching back", async () => {
    await onboarded(A);
    await onboarded(B);
    const { fetchImpl, signIn, patches } = browser();
    const report = createInstallReporter();

    await signIn(A);
    await report(true, fetchImpl);
    await report(true, fetchImpl);
    await signIn(B);
    await report(true, fetchImpl);
    await signIn(A);
    await report(true, fetchImpl);
    await report(true, fetchImpl);

    expect(patches()).toHaveLength(2);
  });

  it("reports once onboarding finishes, then stops", async () => {
    const { fetchImpl, signIn, patches } = browser();
    const report = createInstallReporter();

    await signIn(A);
    await report(true, fetchImpl);

    const a = await onboarded(A);
    await report(true, fetchImpl);
    const sent = patches().length;
    await report(true, fetchImpl);
    expect(await installed(a)).toBe(true);
    expect(patches()).toHaveLength(sent);
  });

  it("reports the account that is signed in when a session answer arrives late", async () => {
    const a = await onboarded(A);
    const b = await onboarded(B);
    const { watchedFetch, signIn, holdNextSession, release, patchesFor } =
      browser();
    const report = createInstallReporter();

    await signIn(A);
    holdNextSession();
    const first = report(true, watchedFetch);
    await signIn(B);
    await report(true, watchedFetch);
    release();
    await first;
    await report(true, watchedFetch);
    await signIn(A);
    await report(true, watchedFetch);

    expect({
      A: await installed(a),
      B: await installed(b),
      patchesA: patchesFor(a),
      patchesB: patchesFor(b),
    }).toEqual({ A: true, B: true, patchesA: 1, patchesB: 1 });
  });

  it.each([
    ["first", 0],
    ["second", 1],
  ])(
    "never PATCHes an already reported account when the %s session answer for another arrives after a switch back",
    async (_, after) => {
      const a = await onboarded(A);
      const b = await onboarded(B);
      const { watchedFetch, signIn, holdNextSession, release, patchesFor } =
        browser();
      const report = createInstallReporter();

      await signIn(B);
      await report(true, watchedFetch);
      await signIn(A);
      holdNextSession(a, after);
      const stale = report(true, watchedFetch);
      await new Promise((resolve) => setTimeout(resolve, 0));
      await signIn(B);
      await report(true, watchedFetch);
      release();
      await stale;
      await report(true, watchedFetch);
      await signIn(A);
      await report(true, watchedFetch);

      expect({
        A: await installed(a),
        B: await installed(b),
        patchesA: patchesFor(a),
        patchesB: patchesFor(b),
      }).toEqual({ A: true, B: true, patchesA: 1, patchesB: 1 });
    },
  );

  it("never PATCHes an already reported account when the switch lands between the check and the write", async () => {
    const a = await onboarded(A);
    const b = await onboarded(B);
    const { watchedFetch, signIn, holdNextPatch, release, patchesFor } =
      browser();
    const report = createInstallReporter();

    await signIn(B);
    await report(true, watchedFetch);
    await signIn(A);
    holdNextPatch();
    const stale = report(true, watchedFetch);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await signIn(B);
    release();
    await stale;
    await report(true, watchedFetch);
    await signIn(A);
    await report(true, watchedFetch);

    expect({
      A: await installed(a),
      B: await installed(b),
      patchesA: patchesFor(a),
      patchesB: patchesFor(b),
    }).toEqual({ A: true, B: true, patchesA: 1, patchesB: 1 });
  });
});
