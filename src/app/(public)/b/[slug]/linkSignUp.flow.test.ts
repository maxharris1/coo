import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  firstBird,
  initialFirstBird,
  onboardingBody,
  submitOnboarding,
} from "@/app/(app)/welcome/bird/choices";
import { saveLoft } from "@/app/(app)/welcome/loft/roost";
import { guestClaimPost } from "@/app/api/guest/[token]/claim/post";
import { guestGet } from "@/app/api/guest/[token]/get";
import { loftPost } from "@/app/api/loft/post";
import { onboardingPost } from "@/app/api/onboarding/post";
import { config } from "@/lib/config";
import { toE164, type E164 } from "@/lib/phone";
import { createJsonRoute } from "@/server/http";
import { tick } from "@/server/services/tick";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { FakeJar } from "@/test/fakes/jar";
import { sendGuestFlight } from "@/test/guestFlight";
import { seedWorld, type World } from "@/test/seedWorld";
import { afterSignIn } from "../../join/returnTo";
import {
  finishLinkSignUp,
  linkRoost,
  pendingLink,
  rememberLink,
} from "./linkSignUp";

vi.mock("@/env", () => ({
  getEnv: () => ({ LINK_TOKEN_PEPPER: "test-pepper" }),
}));

const MINUTE = 60_000;
const PRIYA = toE164("+15550000077") as E164;

let deps: TestDeps;
let world: World;
const store = new Map<string, string>();

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
  store.clear();
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  });
  vi.stubGlobal("document", { cookie: "" });
});
afterEach(() => vi.unstubAllGlobals());

async function newUserFetch() {
  const jsonRoute = createJsonRoute(async () => deps);
  const pepper = () => "test-pepper";
  const routes: [RegExp, (req: NextRequest) => Promise<Response>][] = [
    [/^\/api\/guest\/\w+\/claim$/, guestClaimPost(jsonRoute, pepper)],
    [/^\/api\/guest\/\w+$/, guestGet(jsonRoute, pepper)],
    [/^\/api\/onboarding$/, onboardingPost(jsonRoute)],
    [/^\/api\/loft$/, loftPost(jsonRoute)],
  ];
  const jar = new FakeJar();
  const userId = await deps.auth(jar).verifyCode(PRIYA, "000000");
  const cookie = jar
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");
  const fetchImpl = (async (url: string, init: RequestInit = {}) => {
    const route = routes.find(([path]) => path.test(url));
    if (!route) throw new Error(`no route for ${url}`);
    const headers = new Headers(init.headers);
    headers.set("cookie", cookie);
    return route[1](
      new NextRequest(`https://coo.test${url}`, {
        method: init.method ?? "GET",
        body: init.body,
        headers,
      }),
    );
  }) as unknown as typeof fetch;
  return { userId, fetchImpl };
}

async function signUpFromLink(
  token: string,
  claim: (
    fetchImpl: typeof fetch,
  ) => ReturnType<typeof finishLinkSignUp> = finishLinkSignUp,
) {
  rememberLink({ token, name: "Priya", phone: PRIYA });
  const { userId, fetchImpl } = await newUserFetch();
  const afterCode = afterSignIn("/welcome/install");

  const bird = firstBird(initialFirstBird(), {
    type: "yourName",
    name: pendingLink()?.name ?? "",
  });
  const onboarded = await submitOnboarding(
    onboardingBody(bird, "America/New_York"),
    fetchImpl,
  );

  const roost = await linkRoost(token, fetchImpl);
  if (!roost) throw new Error("no roost from the link");
  const saved = await saveLoft({ lat: roost.lat, lon: roost.lon }, fetchImpl);
  const next = await claim(fetchImpl);
  return { userId, afterCode, onboarded, roost, saved, next };
}

describe("short onboarding from a guest link (ac-3)", () => {
  it("signs a new user up with the link's loft and lands them on Reply while the bird waits", async () => {
    const { token, flightId, arriveAt } = await sendGuestFlight(deps, world);
    deps.clock.set(arriveAt + MINUTE);
    await tick(deps);

    const run = await signUpFromLink(token);

    const [flight] = await deps.db.query<{ to_lat: number; to_lon: number }>(
      "select to_lat, to_lon from flights where id = $1",
      [flightId],
    );
    const [visit] = await deps.db.query<{ id: string; host_id: string }>(
      "select id, host_id from visits where flight_id = $1",
      [flightId],
    );
    const [profile] = await deps.db.query<{ name: string }>(
      "select name from profiles where id = $1",
      [run.userId],
    );
    expect(run.afterCode).toBe("/welcome/bird");
    expect(run.onboarded).toEqual({ ok: true });
    expect(profile.name).toBe("Priya");
    expect(run.roost).toMatchObject({ lat: flight.to_lat, lon: flight.to_lon });
    expect(run.saved.ok).toBe(true);
    expect(visit.host_id).toBe(run.userId);
    expect(run.next).toEqual({ kind: "go", to: `/sill/${visit.id}/reply` });
    expect(pendingLink()).toBeNull();
  });

  it("keeps the claim when the network drops and lands on Reply on retry", async () => {
    const { token, flightId, arriveAt } = await sendGuestFlight(deps, world);
    deps.clock.set(arriveAt + MINUTE);
    await tick(deps);
    const offline = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;

    const run = await signUpFromLink(token, async (fetchImpl) => {
      const first = await finishLinkSignUp(offline);
      expect(first).toEqual({
        kind: "retry",
        message: "We could not reach the loft. Try again.",
      });
      expect(pendingLink()).not.toBeNull();
      return finishLinkSignUp(fetchImpl);
    });

    const [visit] = await deps.db.query<{ id: string }>(
      "select id from visits where flight_id = $1",
      [flightId],
    );
    expect(run.next).toEqual({ kind: "go", to: `/sill/${visit.id}/reply` });
    expect(pendingLink()).toBeNull();
  });

  it("keeps the claim when the claim's response is cut off and lands on Reply on retry", async () => {
    const { token, flightId, arriveAt } = await sendGuestFlight(deps, world);
    deps.clock.set(arriveAt + MINUTE);
    await tick(deps);

    const run = await signUpFromLink(token, async (fetchImpl) => {
      let healthy: unknown;
      const dropped = (async (url: string, init?: RequestInit) => {
        healthy = await (await fetchImpl(url, init)).json();
        return new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(new TextEncoder().encode('{"visitId":'));
              c.error(
                new TypeError("connection lost while reading response body"),
              );
            },
          }),
          { status: 200 },
        );
      }) as unknown as typeof fetch;
      const first = await finishLinkSignUp(dropped);
      expect(healthy).toMatchObject({ visitId: expect.any(String) });
      expect(first).toEqual({
        kind: "retry",
        message: "We could not reach the loft. Try again.",
      });
      expect(pendingLink()).not.toBeNull();
      return finishLinkSignUp(fetchImpl);
    });

    const [visit] = await deps.db.query<{ id: string }>(
      "select id from visits where flight_id = $1",
      [flightId],
    );
    expect(run.next).toEqual({ kind: "go", to: `/sill/${visit.id}/reply` });
    expect(pendingLink()).toBeNull();
  });

  it("lands a new user on the shoebox once the bird has gone home", async () => {
    const { token, flightId, arriveAt } = await sendGuestFlight(deps, world);
    deps.clock.set(arriveAt + (config.game.visits.waitMinutes + 1) * MINUTE);
    await tick(deps);

    const run = await signUpFromLink(token);

    expect(run.next).toEqual({ kind: "go", to: "/shoebox" });
    expect(
      await deps.db.query(
        "select n.recipient_id from flights f join notes n on n.id = f.note_id where f.id = $1",
        [flightId],
      ),
    ).toEqual([{ recipient_id: run.userId }]);
  });
});
