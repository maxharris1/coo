import { beforeEach, describe, expect, it, vi } from "vitest";
import { tick } from "@/server/services/tick";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { sendGuestFlight } from "@/test/guestFlight";
import { seedWorld, type World } from "@/test/seedWorld";
import { reportGuestLink } from "./report";
import { setLandingText } from "./notify";

vi.mock("@/env", () => ({
  getEnv: () => ({ LINK_TOKEN_PEPPER: PEPPER }),
}));

const PEPPER = "test-pepper";
const IP = "203.0.113.7";

let deps: TestDeps;
let world: World;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
});

async function storedPhone() {
  const [row] = await deps.db.query<{ notify_phone: string | null }>(
    "select notify_phone from guest_links",
  );
  return row.notify_phone;
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

const leave = (token: string, phone: string) =>
  setLandingText(deps, PEPPER, IP, token, { phone, consent: true });

describe("setLandingText", () => {
  it("stores the number as E.164 when the box is ticked (ac-4)", async () => {
    const { token } = await sendGuestFlight(deps, world);

    expect(await leave(token, "(212) 555-0142")).toEqual({});

    expect(await storedPhone()).toBe("+12125550142");
  });

  it("refuses a second, different number with conflict and keeps the first", async () => {
    const { token } = await sendGuestFlight(deps, world);
    await leave(token, "212 555 0142");

    expect((await refusal(leave(token, "212 555 0199"))).code).toBe("conflict");
    expect(await storedPhone()).toBe("+12125550142");
  });

  it("accepts the same number again", async () => {
    const { token } = await sendGuestFlight(deps, world);
    await leave(token, "212 555 0142");

    expect(await leave(token, "+1 212 555 0142")).toEqual({});
  });

  it("refuses something that is not a phone number as invalid", async () => {
    const { token } = await sendGuestFlight(deps, world);

    expect((await refusal(leave(token, "call me"))).code).toBe("invalid");
    expect(await storedPhone()).toBeNull();
  });

  it("allows three attempts per link, then rate_limited", async () => {
    const { token } = await sendGuestFlight(deps, world);
    await refusal(leave(token, "nope"));
    await refusal(leave(token, "still nope"));
    await leave(token, "212 555 0142");

    expect((await refusal(leave(token, "212 555 0142"))).code).toBe(
      "rate_limited",
    );
  });

  it("answers a wrong token like a missing link and stores nothing", async () => {
    await sendGuestFlight(deps, world);

    expect(
      (await refusal(leave("AAAAAAAAAAAAAAAA", "212 555 0142"))).code,
    ).toBe("not_found");
    expect(await storedPhone()).toBeNull();
  });

  it("refuses a reported link with not_found", async () => {
    const { token } = await sendGuestFlight(deps, world);
    await reportGuestLink(deps, PEPPER, IP, token, "Spam");

    expect((await refusal(leave(token, "212 555 0142"))).code).toBe(
      "not_found",
    );
    expect(await storedPhone()).toBeNull();
  });

  it("refuses a number once the bird has landed", async () => {
    const { token, arriveAt } = await sendGuestFlight(deps, world);
    deps.clock.set(arriveAt + 1000);
    await tick(deps);

    expect((await refusal(leave(token, "212 555 0142"))).code).toBe("conflict");
    expect(await storedPhone()).toBeNull();
  });
});
