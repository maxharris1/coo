import type { UserId } from "@/server/ports/auth";
import type { GuestSendResult } from "@/server/services/flights/guestSend";
import { send } from "@/server/services/flights/send";
import { searchPlaces } from "@/server/services/places";
import type { TestDeps } from "./deps";
import type { World } from "./seedWorld";

export async function sendGuestFlight(
  deps: TestDeps,
  world: World,
  body = "Come see the new loft",
) {
  const max = world.max.id as UserId;
  const { results } = await searchPlaces(deps, max, "Williamsburg");
  const result = (await send(deps, max, {
    body,
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
    flightId: result.flights[0].id,
    arriveAt: result.flights[0].arriveAt as number,
  };
}
