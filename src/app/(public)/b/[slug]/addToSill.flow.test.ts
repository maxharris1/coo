import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { guestClaimPost } from "@/app/api/guest/[token]/claim/post";
import { config } from "@/lib/config";
import { toE164, type E164 } from "@/lib/phone";
import { createJsonRoute } from "@/server/http";
import type { UserId } from "@/server/ports/auth";
import { pair } from "@/server/rows";
import { tick } from "@/server/services/tick";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { FakeJar } from "@/test/fakes/jar";
import { sendGuestFlight } from "@/test/guestFlight";
import { seedWorld, type World } from "@/test/seedWorld";
import { claimLink } from "./claimLink";

vi.mock("@/env", () => ({
  getEnv: () => ({ LINK_TOKEN_PEPPER: "test-pepper" }),
}));

const MINUTE = 60_000;
const ROSA = "+15550000003";

let deps: TestDeps;
let world: World;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
  await deps.db.query("delete from friendships where a_id = $1 and b_id = $2", [
    ...pair(world.max.id as UserId, world.rosa.id as UserId),
  ]);
});

async function landed() {
  const sent = await sendGuestFlight(deps, world);
  deps.clock.set(sent.arriveAt + MINUTE);
  await tick(deps);
  return sent;
}

async function signedInFetch() {
  const route = guestClaimPost(
    createJsonRoute(async () => deps),
    () => "test-pepper",
  );
  const jar = new FakeJar();
  await deps.auth(jar).verifyCode(toE164(ROSA) as E164, "000000");
  const cookie = jar
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");
  return (async (url: string, init: RequestInit) => {
    const headers = new Headers(init.headers);
    headers.set("cookie", cookie);
    return route(
      new NextRequest(`https://coo.test${url}`, {
        method: init.method,
        body: init.body,
        headers,
      }),
    );
  }) as unknown as typeof fetch;
}

describe("Add to my sill, against the claim API", () => {
  it("lands a signed-in user on Reply while the bird waits", async () => {
    const { token, flightId } = await landed();
    deps.clock.set(deps.clock.now() + 10 * MINUTE);

    const result = await claimLink(token, await signedInFetch());

    const [visit] = await deps.db.query<{ id: string; host_id: string }>(
      "select id, host_id from visits where flight_id = $1",
      [flightId],
    );
    expect(visit.host_id).toBe(world.rosa.id);
    expect(result).toEqual({ ok: true, next: `/sill/${visit.id}/reply` });
  });

  it("lands a signed-in user on the shoebox once the bird has gone home", async () => {
    const { token, flightId, arriveAt } = await landed();
    deps.clock.set(arriveAt + (config.game.visits.waitMinutes + 1) * MINUTE);
    await tick(deps);

    const result = await claimLink(token, await signedInFetch());

    expect(result).toEqual({ ok: true, next: "/shoebox" });
    expect(
      await deps.db.query(
        "select n.recipient_id from flights f join notes n on n.id = f.note_id where f.id = $1",
        [flightId],
      ),
    ).toEqual([{ recipient_id: world.rosa.id }]);
  });
});
