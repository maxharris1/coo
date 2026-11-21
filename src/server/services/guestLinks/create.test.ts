import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type { UserId } from "@/server/ports/auth";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { seedWorld, type World } from "@/test/seedWorld";
import { createGuestLink, hashToken, type GuestLinkDraft } from "./create";

const PEPPER = "test-pepper";
const NEW_YORK = "America/New_York";

let deps: TestDeps;
let world: World;
let max: UserId;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
  max = world.max.id as UserId;
});

function draft(at: string, senderId: UserId = max): GuestLinkDraft {
  return {
    senderId,
    recipientName: "Maya",
    dest: { point: { lat: 40.7128, lon: -74.006 }, label: "Tribeca" },
    birdName: "Gerald",
    timezone: NEW_YORK,
    now: Date.parse(at),
  };
}

function create(at: string, senderId?: UserId) {
  return deps.db.tx((tx) =>
    createGuestLink(deps, tx, PEPPER, draft(at, senderId)),
  );
}

async function refusal(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    return (error as { code: string }).code;
  }
  return "resolved";
}

async function linksBy(sender: UserId): Promise<number> {
  const [{ count }] = await deps.db.query<{ count: number }>(
    "select count(*)::int from guest_links where sender_id = $1",
    [sender],
  );
  return count;
}

function tokenOf(url: string): string {
  return url.slice(url.lastIndexOf("-") + 1);
}

describe("createGuestLink", () => {
  it("refuses the 6th link in the sender's local day as rate_limited", async () => {
    for (let i = 0; i < 4; i++) await create("2026-11-19T15:00:00Z");
    await create("2026-11-20T03:00:00Z");

    expect(await refusal(create("2026-11-20T04:00:00Z"))).toBe("rate_limited");
    expect(await linksBy(max)).toBe(5);

    await create("2026-11-20T05:30:00Z");
    expect(await linksBy(max)).toBe(6);
  });

  it("counts each sender's links separately", async () => {
    for (let i = 0; i < 5; i++) await create("2026-11-19T15:00:00Z");
    const priya = world.priya.id as UserId;

    await create("2026-11-19T15:00:00Z", priya);

    expect(await linksBy(priya)).toBe(1);
  });

  it("stores sha256(pepper + token) and never the token", async () => {
    const link = await create("2026-11-19T15:00:00Z");

    expect(link.url).toMatch(
      /^https:\/\/coo\.example\/b\/gerald-[A-Za-z0-9]{16}$/,
    );
    const token = tokenOf(link.url);
    expect(hashToken(PEPPER, token)).toBe(
      createHash("sha256")
        .update(PEPPER + token)
        .digest("hex"),
    );
    const [row] = await deps.db.query<{
      token_hash: string;
      recipient_name: string;
      dest_label: string;
      created_at: Date;
      text: string;
    }>(
      `select token_hash, recipient_name, dest_label, created_at,
         row_to_json(g)::text as text
       from guest_links g where id = $1 and sender_id = $2`,
      [link.id, max],
    );
    expect(row).toMatchObject({
      token_hash: hashToken(PEPPER, token),
      recipient_name: "Maya",
      dest_label: "Tribeca",
    });
    expect(row.created_at.toISOString()).toBe("2026-11-19T15:00:00.000Z");
    expect(row.text).not.toContain(token);
  });

  it("makes a new token for every link", async () => {
    const first = await create("2026-11-19T15:00:00Z");
    const second = await create("2026-11-19T15:00:00Z");

    expect(tokenOf(first.url)).not.toBe(tokenOf(second.url));
  });
});
