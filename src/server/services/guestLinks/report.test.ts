import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserId } from "@/server/ports/auth";
import type { GuestSendResult } from "@/server/services/flights/guestSend";
import { send } from "@/server/services/flights/send";
import { searchPlaces } from "@/server/services/places";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { seedWorld, type World } from "@/test/seedWorld";
import { getGuestLink } from "./get";
import { reportGuestLink } from "./report";

vi.mock("@/env", () => ({
  getEnv: () => ({ LINK_TOKEN_PEPPER: PEPPER }),
}));

const PEPPER = "test-pepper";
const IP = "203.0.113.7";

let deps: TestDeps;
let world: World;
let max: UserId;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
  max = world.max.id as UserId;
});

async function guestToken() {
  const { results } = await searchPlaces(deps, max, "Williamsburg");
  const result = (await send(deps, max, {
    body: "Come see the new loft",
    sends: [
      {
        guest: { name: "Sam", placeId: results[0].placeId },
        birdId: world.max.birds[0].id,
      },
    ],
  })) as GuestSendResult;
  const url = result.guestLinks[0].url;
  return url.slice(url.lastIndexOf("-") + 1);
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

async function notificationCount() {
  const [{ count }] = await deps.db.query<{ count: number }>(
    "select count(*)::int from notifications",
  );
  return count;
}

describe("reportGuestLink", () => {
  it("hides the link behind the same not_found as a wrong token (ac-3)", async () => {
    const token = await guestToken();

    expect(await reportGuestLink(deps, PEPPER, IP, token, "Spam")).toEqual({});

    const afterReport = await refusal(getGuestLink(deps, PEPPER, IP, token));
    const wrong = await refusal(
      getGuestLink(deps, PEPPER, IP, "AAAAAAAAAAAAAAAA"),
    );
    expect(afterReport.code).toBe("not_found");
    expect(afterReport).toEqual(wrong);
  });

  it("records the reason against the link and tells nobody", async () => {
    const token = await guestToken();
    const notificationsBefore = await notificationCount();

    await reportGuestLink(deps, PEPPER, IP, token, "Not someone I know");

    const [link] = await deps.db.query<{ id: string; status: string }>(
      "select id, status from guest_links",
    );
    expect(link.status).toBe("reported");
    expect(
      await deps.db.query(
        "select reporter_id, target_user_id, guest_link_id, reason, created_at from reports",
      ),
    ).toEqual([
      {
        reporter_id: null,
        target_user_id: null,
        guest_link_id: link.id,
        reason: "Not someone I know",
        created_at: new Date(deps.clock.now()),
      },
    ]);
    expect(await notificationCount()).toBe(notificationsBefore);
    expect(deps.sms.sent).toEqual([]);
    expect(deps.push.sent).toEqual([]);
  });

  it("answers a second report with not_found and files one report", async () => {
    const token = await guestToken();
    await reportGuestLink(deps, PEPPER, IP, token, "Spam");

    const second = await refusal(
      reportGuestLink(deps, PEPPER, IP, token, "Spam"),
    );

    expect(second.code).toBe("not_found");
    const [{ count }] = await deps.db.query<{ count: number }>(
      "select count(*)::int from reports",
    );
    expect(count).toBe(1);
  });
});
