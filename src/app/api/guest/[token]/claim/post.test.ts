import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserId } from "@/server/ports/auth";
import { pair } from "@/server/rows";
import { tick } from "@/server/services/tick";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { geoClient } from "@/test/geoRoute";
import { sendGuestFlight } from "@/test/guestFlight";
import { seedWorld, type World } from "@/test/seedWorld";
import { guestClaimPost } from "./post";

vi.mock("@/env", () => ({
  getEnv: () => ({ LINK_TOKEN_PEPPER: PEPPER }),
}));

const PEPPER = "test-pepper";
const PHONE = {
  max: "+15550000001",
  priya: "+15550000002",
  rosa: "+15550000003",
};

let deps: TestDeps;
let world: World;
let token: string;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
  await deps.db.query("delete from friendships where a_id = $1 and b_id = $2", [
    ...pair(world.max.id as UserId, world.rosa.id as UserId),
  ]);
  const sent = await sendGuestFlight(deps, world);
  token = sent.token;
  deps.clock.set(sent.arriveAt + 60_000);
  await tick(deps);
});

const claimer = (t: string) =>
  geoClient(
    deps,
    (r) => guestClaimPost(r, () => PEPPER),
    `/api/guest/${t}/claim`,
  );

async function claimAs(who: keyof typeof PHONE | null, t = token) {
  const client = claimer(t);
  const jar = who ? (await client.signIn(PHONE[who])).jar : undefined;
  return client.post({}, jar);
}

describe("POST /api/guest/[token]/claim", () => {
  it("refuses a signed-out caller", async () => {
    const res = await claimAs(null);
    expect(res.status).toBe(401);
    expect(res.json.error.code).toBe("unauthenticated");
  });

  it("answers a wrong token with not_found", async () => {
    const res = await claimAs("rosa", "AAAAAAAAAAAAAAAA");
    expect(res.status).toBe(404);
    expect(res.json.error.code).toBe("not_found");
  });

  it("refuses the attempt after the per-minute limit from one address, wrong tokens included", async () => {
    const client = claimer("AAAAAAAAAAAAAAAA");
    const { jar } = await client.signIn(PHONE.rosa);
    for (let i = 0; i < deps.config.game.limits.guestViewsPerMinutePerIp; i++) {
      const res = await client.post({}, jar);
      expect(res.status).toBe(404);
      expect(res.json.error.code).toBe("not_found");
    }

    const res = await client.post({}, jar);
    expect(res.status).toBe(429);
    expect(res.json.error.code).toBe("rate_limited");
  });

  it("refuses the sender claiming their own link", async () => {
    const res = await claimAs("max");
    expect(res.status).toBe(409);
    expect(res.json.error.code).toBe("conflict");
  });

  it("refuses someone else once the link is claimed", async () => {
    expect((await claimAs("rosa")).status).toBe(200);
    const res = await claimAs("priya");
    expect(res.status).toBe(410);
    expect(res.json.error.code).toBe("gone");
    const [link] = await deps.db.query<{ claimed_by: string }>(
      "select claimed_by from guest_links",
    );
    expect(link.claimed_by).toBe(world.rosa.id);
  });

  it("refuses a body with fields", async () => {
    const client = claimer(token);
    const { jar } = await client.signIn(PHONE.rosa);
    const res = await client.post({ claimedBy: world.priya.id }, jar);
    expect(res.status).toBe(400);
    expect(res.json.error.code).toBe("invalid");
  });
});
