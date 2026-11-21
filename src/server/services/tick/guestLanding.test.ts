import { beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "@/lib/config";
import { setLandingText } from "@/server/services/guestLinks/notify";
import { tick } from "@/server/services/tick";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { sendGuestFlight } from "@/test/guestFlight";
import { seedWorld, type World } from "@/test/seedWorld";

vi.mock("@/env", () => ({
  getEnv: () => ({ LINK_TOKEN_PEPPER: PEPPER }),
}));

const PEPPER = "test-pepper";
const PHONE = "+12125550142";
const DAY_MS = 86_400_000;

let deps: TestDeps;
let world: World;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
});

async function link() {
  const [row] = await deps.db.query<{
    notify_phone: string | null;
    expires_at: Date | null;
  }>("select notify_phone, expires_at from guest_links");
  return row;
}

async function landWithNumber() {
  const flight = await sendGuestFlight(deps, world);
  await setLandingText(deps, PEPPER, "203.0.113.7", flight.token, {
    phone: PHONE,
    consent: true,
  });
  deps.clock.set(flight.arriveAt + 1000);
  return flight;
}

describe("guest landing in the tick", () => {
  it("sends one guest-landed text, then clears the number (ac-4)", async () => {
    const { arriveAt } = await landWithNumber();

    await tick(deps);

    expect(deps.sms.sent).toEqual([
      {
        to: PHONE,
        body: `${config.app.name}: Gerald has landed with your note from Max. https://${config.app.domain} ${config.app.sms.stopLine}`,
      },
    ]);
    const after = await link();
    expect(after.notify_phone).toBeNull();
    expect(after.expires_at?.getTime()).toBe(
      arriveAt + config.game.guestLinks.expireDays * DAY_MS,
    );
  });

  it("never sends the text twice", async () => {
    await landWithNumber();

    await tick(deps);
    await tick(deps);

    expect(deps.sms.sent).toHaveLength(1);
  });

  it("clears the number even when the text fails", async () => {
    await landWithNumber();
    deps.sms.failNext(30003);

    await tick(deps);

    expect(deps.sms.sent).toEqual([]);
    expect((await link()).notify_phone).toBeNull();
    await tick(deps);
    expect(deps.sms.sent).toEqual([]);
  });

  it("sets expires_at and texts nobody when no number was left", async () => {
    const { arriveAt } = await sendGuestFlight(deps, world);
    deps.clock.set(arriveAt + 1000);

    await tick(deps);

    expect(deps.sms.sent).toEqual([]);
    expect((await link()).expires_at?.getTime()).toBe(
      arriveAt + config.game.guestLinks.expireDays * DAY_MS,
    );
  });
});
