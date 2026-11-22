import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { geoClient } from "@/test/geoRoute";
import { sendGuestFlight } from "@/test/guestFlight";
import { seedWorld, type World } from "@/test/seedWorld";
import { guestNotifyPost } from "./post";

vi.mock("@/env", () => ({
  getEnv: () => ({ LINK_TOKEN_PEPPER: PEPPER }),
}));

const PEPPER = "test-pepper";

let deps: TestDeps;
let world: World;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
});

const notify = (token: string) =>
  geoClient(
    deps,
    (r) => guestNotifyPost(r, () => PEPPER),
    `/api/guest/${token}/notify`,
  );

async function storedPhone() {
  const [row] = await deps.db.query<{ notify_phone: string | null }>(
    "select notify_phone from guest_links",
  );
  return row.notify_phone;
}

describe("POST /api/guest/[token]/notify", () => {
  it.each([
    ["unticked", { phone: "212 555 0142", consent: false }],
    ["missing", { phone: "212 555 0142" }],
    ["not a boolean", { phone: "212 555 0142", consent: "true" }],
  ])(
    "refuses a number with the box %s as 400 invalid and stores nothing (ac-4)",
    async (_, body) => {
      const { token } = await sendGuestFlight(deps, world);

      const { status, json } = await notify(token).post(body);

      expect(status).toBe(400);
      expect(json.error.code).toBe("invalid");
      expect(await storedPhone()).toBeNull();
    },
  );

  it("stores the number with the box ticked", async () => {
    const { token } = await sendGuestFlight(deps, world);

    const { status } = await notify(token).post({
      phone: "212 555 0142",
      consent: true,
    });

    expect(status).toBe(200);
    expect(await storedPhone()).toBe("+12125550142");
  });

  it("answers a wrong token with 404 not_found", async () => {
    await sendGuestFlight(deps, world);

    const { status, json } = await notify("AAAAAAAAAAAAAAAA").post({
      phone: "212 555 0142",
      consent: true,
    });

    expect(status).toBe(404);
    expect(json.error.code).toBe("not_found");
  });
});
