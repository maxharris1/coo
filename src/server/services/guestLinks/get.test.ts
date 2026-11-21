import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserId } from "@/server/ports/auth";
import type { GuestSendResult } from "@/server/services/flights/guestSend";
import { send } from "@/server/services/flights/send";
import { searchPlaces } from "@/server/services/places";
import { tick } from "@/server/services/tick";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { seedWorld, type World } from "@/test/seedWorld";
import { getGuestLink } from "./get";

vi.mock("@/env", () => ({
  getEnv: () => ({ LINK_TOKEN_PEPPER: PEPPER }),
}));

const PEPPER = "test-pepper";
const BODY = "Come see the new loft";
const IP = "203.0.113.7";

let deps: TestDeps;
let world: World;
let max: UserId;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
  max = world.max.id as UserId;
});

async function guestFlight() {
  const { results } = await searchPlaces(deps, max, "Williamsburg");
  const result = (await send(deps, max, {
    body: BODY,
    sends: [
      {
        guest: { name: "Sam", placeId: results[0].placeId },
        birdId: world.max.birds[0].id,
      },
    ],
  })) as GuestSendResult;
  const url = result.guestLinks[0].url;
  return {
    token: url.slice(url.lastIndexOf("-") + 1),
    arriveAt: result.flights[0].arriveAt as number,
  };
}

async function refusal(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    const { code, message } = error as { code: string; message: string };
    return { code, message };
  }
  throw new Error("expected a refusal");
}

describe("getGuestLink", () => {
  it("shows the flight without the note until the bird lands, then the note (ac-2)", async () => {
    const { token, arriveAt } = await guestFlight();

    const flying = await getGuestLink(deps, PEPPER, IP, token);
    expect(flying).not.toHaveProperty("note");
    expect(JSON.stringify(flying)).not.toContain(BODY);
    expect(flying).toMatchObject({
      senderName: "Max",
      recipientName: "Sam",
      bird: { name: world.max.birds[0].name },
      flight: { status: "flying", to: { label: "Williamsburg" } },
    });

    deps.clock.set(arriveAt + 1000);
    await tick(deps);

    const landed = await getGuestLink(deps, PEPPER, IP, token);
    expect(landed.flight.status).toBe("landed");
    expect(landed.note?.body).toBe(BODY);
  });

  it("names nothing about the sender beyond a first name", async () => {
    const { token } = await guestFlight();
    const [sender] = await deps.db.query<{ handle: string }>(
      "select handle from profiles where id = $1",
      [max],
    );

    const text = JSON.stringify(await getGuestLink(deps, PEPPER, IP, token));

    expect(text).not.toContain(max);
    expect(text).not.toContain(sender.handle);
    expect(text).not.toContain(world.max.birds[0].id);
  });

  it("refuses a wrong, empty or malformed token with the same not_found (ac-2)", async () => {
    await guestFlight();

    const wrong = await refusal(
      getGuestLink(deps, PEPPER, IP, "AAAAAAAAAAAAAAAA"),
    );
    const empty = await refusal(getGuestLink(deps, PEPPER, IP, ""));
    const badChars = await refusal(
      getGuestLink(deps, PEPPER, IP, "AAAAAAAA-AAAAAAA"),
    );

    expect(wrong.code).toBe("not_found");
    expect(empty).toEqual(wrong);
    expect(badChars).toEqual(wrong);
  });

  it("marks the link opened once and keeps the first time", async () => {
    const { token } = await guestFlight();
    const openedAt = async () =>
      (
        await deps.db.query<{ opened_at: Date | null }>(
          "select opened_at from guest_links",
        )
      )[0].opened_at;

    expect(await openedAt()).toBeNull();
    const first = deps.clock.now();
    await getGuestLink(deps, PEPPER, IP, token);
    deps.clock.set(first + 60_000);
    await getGuestLink(deps, PEPPER, IP, token);

    expect(await openedAt()).toEqual(new Date(first));
  });

  it("refuses the 31st view from one address within a minute", async () => {
    const { token } = await guestFlight();
    for (let i = 0; i < deps.config.game.limits.guestViewsPerMinutePerIp; i++) {
      await getGuestLink(deps, PEPPER, IP, token);
    }

    expect((await refusal(getGuestLink(deps, PEPPER, IP, token))).code).toBe(
      "rate_limited",
    );
    await expect(
      getGuestLink(deps, PEPPER, "198.51.100.1", token),
    ).resolves.toBeDefined();
  });

  it("answers gone once the link has expired", async () => {
    const { token } = await guestFlight();
    await deps.db.query("update guest_links set expires_at = $1", [
      new Date(deps.clock.now() - 1000).toISOString(),
    ]);

    expect((await refusal(getGuestLink(deps, PEPPER, IP, token))).code).toBe(
      "gone",
    );
  });
});
