import type { Db } from "@/server/db";
import type { UserId } from "@/server/ports/auth";
import type { GuestSendResult } from "@/server/services/flights/guestSend";
import { send } from "@/server/services/flights/send";
import { searchPlaces } from "@/server/services/places";
import { landDeliveries } from "@/server/services/tick/landDeliveries";
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

const FLIGHT_LOCK =
  /select 1 from flights where guest_link_id[\s\S]*for update/;

export function landingAtFirstFlightLock(deps: TestDeps, landAt: number) {
  const landings: Awaited<ReturnType<typeof landDeliveries>>[] = [];
  const wrap = (db: Db): Db => ({
    async query<T>(sql: string, params?: unknown[]) {
      if (landings.length === 0 && FLIGHT_LOCK.test(sql)) {
        deps.clock.set(landAt);
        landings.push(
          await landDeliveries({
            deps: { ...deps, db },
            limit: 50,
            timeUp: () => false,
          }),
        );
      }
      return db.query<T>(sql, params);
    },
    tx: (fn) => db.tx((tx) => fn(wrap(tx))),
  });
  return { deps: { ...deps, db: wrap(deps.db) }, landings };
}
