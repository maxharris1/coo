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
import { snap, type Point } from "@/lib/game/privacy";
import { toE164, type E164 } from "@/lib/phone";
import { createJsonRoute } from "@/server/http";
import type { UserId } from "@/server/ports/auth";
import { endpointOf, legFor } from "@/server/services/flights/quote";
import {
  LOFT_COLUMNS,
  loftsOf,
  type LoftColumns,
} from "@/server/services/friends";
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
  if (!userId) throw new Error("sign-in failed");
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
  home: (guess: Point) => Point = (guess) => guess,
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
  const saved = await saveLoft(
    home({ lat: roost.lat, lon: roost.lon }),
    fetchImpl,
  );
  const next = await claim(fetchImpl);
  return { userId, afterCode, onboarded, roost, saved, next, fetchImpl };
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

const OWN_SPOT = { lat: 39.97131, lon: -75.13377 };
const ownSpot = () => OWN_SPOT;

async function homeOf(userId: string) {
  const [row] = await deps.db.query<{ home_lat: number; home_lon: number }>(
    "select home_lat, home_lon from profiles where id = $1",
    [userId],
  );
  return { lat: row.home_lat, lon: row.home_lon };
}

async function deliveryOf(flightId: string) {
  const [row] = await deps.db.query<{ status: string }>(
    `select f.status, f.to_lat, f.to_lon, f.to_label, f.arrive_at, f.plan, f.input,
       g.dest_lat, g.dest_lon, g.dest_label
     from flights f join guest_links g on g.id = f.guest_link_id
     where f.id = $1`,
    [flightId],
  );
  return row;
}

async function guessOf(flightId: string) {
  const [row] = await deps.db.query<{ to_lat: number; to_lon: number }>(
    "select to_lat, to_lon from flights where id = $1",
    [flightId],
  );
  return { lat: row.to_lat, lon: row.to_lon };
}

describe("the recipient's own roost replaces the sender's guess", () => {
  it("saves the spot they picked in onboarding, snapped, as their loft", async () => {
    const { token, flightId } = await sendGuestFlight(deps, world);

    const run = await signUpFromLink(token, finishLinkSignUp, ownSpot);

    const home = await homeOf(run.userId);
    expect(home).toEqual(snap(OWN_SPOT.lat, OWN_SPOT.lon));
    expect(home).not.toEqual(await guessOf(flightId));
  });

  it("saves the sender's guess when they confirm the prefill unchanged", async () => {
    const { token, flightId } = await sendGuestFlight(deps, world);

    const run = await signUpFromLink(token);

    expect(await homeOf(run.userId)).toEqual(await guessOf(flightId));
  });

  it("replaces the guess when they change their loft later through POST /api/loft", async () => {
    const { token } = await sendGuestFlight(deps, world);
    const run = await signUpFromLink(token);

    const moved = await saveLoft(OWN_SPOT, run.fetchImpl);

    expect(moved.ok).toBe(true);
    expect(await homeOf(run.userId)).toEqual(snap(OWN_SPOT.lat, OWN_SPOT.lon));
  });

  it("replaces the guess with the snapped town centre when they pick their town later", async () => {
    const { token } = await sendGuestFlight(deps, world);
    const run = await signUpFromLink(token);

    const moved = await saveLoft(
      { lat: 39.97137, lon: -75.13387, centre: true },
      run.fetchImpl,
    );

    expect(moved.ok).toBe(true);
    const [row] = await deps.db.query<{
      home_lat: number;
      home_lon: number;
      home_city_lat: number;
      home_city_lon: number;
    }>(
      "select home_lat, home_lon, home_city_lat, home_city_lon from profiles where id = $1",
      [run.userId],
    );
    expect(row).toEqual({
      home_lat: snap(39.9526, -75.1652).lat,
      home_lon: snap(39.9526, -75.1652).lon,
      home_city_lat: 39.9526,
      home_city_lon: -75.1652,
    });
  });
});

describe("a guest delivery already in the air keeps its destination", () => {
  it("leaves the flying row and the link's dest alone through claim and a later loft change", async () => {
    const { token, flightId } = await sendGuestFlight(deps, world);
    const sent = await deliveryOf(flightId);

    const run = await signUpFromLink(token, finishLinkSignUp, ownSpot);
    await saveLoft({ lat: 40.7306, lon: -73.9866 }, run.fetchImpl);

    expect(run.next).toMatchObject({ kind: "go" });
    expect(sent.status).toBe("flying");
    expect(await deliveryOf(flightId)).toEqual(sent);
  });

  it("starts the return flight from the baked guess, not the new loft", async () => {
    const { token, flightId, arriveAt } = await sendGuestFlight(deps, world);
    const guess = await guessOf(flightId);
    const run = await signUpFromLink(token, finishLinkSignUp, ownSpot);
    await saveLoft({ lat: 40.7306, lon: -73.9866 }, run.fetchImpl);

    deps.clock.set(arriveAt + MINUTE);
    await tick(deps);
    deps.clock.set(arriveAt + (config.game.visits.waitMinutes + 1) * MINUTE);
    await tick(deps);

    const [back] = await deps.db.query<{ from_lat: number; from_lon: number }>(
      `select r.from_lat, r.from_lon from flights r
       join flights f on f.guest_link_id = r.guest_link_id
       where f.id = $1 and r.kind = 'return'`,
      [flightId],
    );
    expect(back).toEqual({ from_lat: guess.lat, from_lon: guess.lon });
  });

  it("sends the next friend-to-friend note to the recipient's own loft", async () => {
    const { token } = await sendGuestFlight(deps, world);
    const run = await signUpFromLink(token, finishLinkSignUp, ownSpot);
    const max = world.max.id as UserId;
    const [mine] = await deps.db.query<LoftColumns>(
      `select ${LOFT_COLUMNS.join(", ")} from profiles where id = $1`,
      [max],
    );
    const myLofts = loftsOf(mine);

    const { to } = await legFor(
      deps,
      max,
      myLofts,
      endpointOf("block", myLofts)!,
      {
        friendId: run.userId,
      },
    );

    expect(to.point).toEqual(snap(OWN_SPOT.lat, OWN_SPOT.lon));
  });
});
