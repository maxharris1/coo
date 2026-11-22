import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Point } from "@/lib/game/privacy";
import type { UserId } from "@/server/ports/auth";
import { getFlight } from "@/server/services/flights/get";
import type { GuestSendResult } from "@/server/services/flights/guestSend";
import { send } from "@/server/services/flights/send";
import { getGuestLink } from "@/server/services/guestLinks/get";
import { searchPlaces } from "@/server/services/places";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { seedWorld, type World } from "@/test/seedWorld";
import PrivacyPage from "../privacy/page";

vi.mock("@/env", () => ({
  getEnv: () => ({ LINK_TOKEN_PEPPER: PEPPER }),
}));

const PEPPER = "test-pepper";
const EAST_VILLAGE_PIN: Point = { lat: 40.731234567, lon: -73.986543219 };

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

async function sendWithPin() {
  const max = world.max.id as UserId;
  const { results } = await searchPlaces(deps, max, "Williamsburg");
  const result = (await send(deps, max, {
    body: "Come see the new loft",
    sends: [
      {
        guest: {
          name: "Sam",
          placeId: results[0].placeId,
          pin: EAST_VILLAGE_PIN,
        },
        birdId: world.max.birds[0].id,
      },
    ],
  })) as GuestSendResult;
  const url = result.guestLinks[0].url;
  return {
    max,
    flightId: result.flights[0].id,
    token: url.slice(url.lastIndexOf("-") + 1),
  };
}

describe("/privacy on a hand-placed destination pin (docs/12 Location #1)", () => {
  it("matches the service: the pin is kept exactly and shown to the sender and link holder", async () => {
    const { max, flightId, token } = await sendWithPin();
    const [stored] = await deps.db.query<{ to_lat: number; to_lon: number }>(
      "select to_lat, to_lon from flights where id = $1",
      [flightId],
    );
    expect(stored).toEqual({
      to_lat: EAST_VILLAGE_PIN.lat,
      to_lon: EAST_VILLAGE_PIN.lon,
    });
    expect((await getFlight(deps, max, flightId)).to).toMatchObject(
      EAST_VILLAGE_PIN,
    );
    expect(
      (await getGuestLink(deps, PEPPER, "203.0.113.7", token)).flight.to,
    ).toMatchObject(EAST_VILLAGE_PIN);

    expect(privacy).not.toContain(
      "The place you pick for a flight is snapped to the same grid",
    );
    expect(privacy).toContain(
      "If you drop a pin by hand to send a bird to someone new, we keep that pin exactly where you put it.",
    );
    expect(privacy).toContain(
      "Only you and whoever holds that bird's guest link can see it.",
    );
  });

  it("scopes the never-keep promise on exact location to that pin", () => {
    expect(privacy).toContain(
      "Your exact location. A position from your phone or a search is snapped to the grid before it is saved or logged. The one exact point we keep is a pin you drop by hand for a flight, and it never goes into our logs.",
    );
  });
});
