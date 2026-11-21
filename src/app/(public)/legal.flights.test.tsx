import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import type { UserId } from "@/server/ports/auth";
import { getFlight } from "@/server/services/flights/get";
import { friendshipBetween, unfriend } from "@/server/services/friends";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { insertWaitingVisit } from "@/test/fixtures/visits";
import { seedWorld, type World } from "@/test/seedWorld";
import PrivacyPage from "../privacy/page";

const privacy = renderToStaticMarkup(<PrivacyPage />)
  .replace(/<[^>]+>/g, " ")
  .replaceAll("&#x27;", "'")
  .replaceAll("&quot;", '"')
  .replace(/\s+/g, " ");

let deps: TestDeps;
let world: World;

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
});

describe("/privacy on flight endpoints (docs/12 Location #5)", () => {
  it("never promises that non-friends see no roost at all", () => {
    expect(privacy).not.toContain(
      "People who are not your friends see neither.",
    );
  });

  it("says a flight shows its endpoints to both people, friends or not", () => {
    expect(privacy).toContain(
      "A flight shows where it left from and where it lands to the two people in it, even if you are not friends or stop being friends.",
    );
  });

  it("says a guest link shows the guest the flight's endpoints", () => {
    expect(privacy).toContain(
      "If you send a bird by guest link, the person holding that link sees those two places too.",
    );
  });

  it("matches the service: an ex-friend still sees the flight's roost", async () => {
    const max = world.max.id as UserId;
    const priya = world.priya.id as UserId;
    const { flightId } = await insertWaitingVisit(
      deps.db,
      world,
      deps.clock.now(),
    );
    await unfriend(deps, max, priya);
    expect(await friendshipBetween(deps.db, max, priya)).toBeNull();

    const flight = await getFlight(deps, priya, flightId);
    expect(flight.from).toMatchObject({ label: "East Village" });
    expect(privacy).toContain(
      "even if you are not friends or stop being friends",
    );
  });
});
