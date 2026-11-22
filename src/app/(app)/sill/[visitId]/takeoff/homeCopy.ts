import { clockTime, fill, type Pronoun } from "@/lib/format";
import type { Flight } from "@/server/services/flights/shape";
import type { TakeoffCopy } from "../../../send/takeoff/[flightId]/takeoffCopy";

export type HomeCopy = TakeoffCopy & { watch: string; birdTitle: string };

const NOTE =
  "{bird} has your reply for {recipient}. {He} should land around {lands}.";

export function homeCopy(
  flight: Flight,
  pronoun: Pronoun,
  timeZone: string,
): HomeCopy {
  const at = (ms: number) => clockTime(new Date(ms), timeZone);
  return {
    released: `Released ${at(flight.releaseAt)}`,
    headline: "Homeward bound",
    note: fill(
      NOTE,
      {
        bird: flight.bird.name,
        // A return flight belongs to the bird's owner; the counterpart is the viewer.
        recipient: flight.owner.name,
        lands: flight.arriveAt === undefined ? undefined : at(flight.arriveAt),
      },
      pronoun,
    ),
    watch: fill("Watch {him} go", {}, pronoun),
    birdTitle: `${flight.bird.name} launching off your sill with the reply`,
  };
}
