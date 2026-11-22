import { clockTime, fill, type Pronoun } from "@/lib/format";
import type { Flight } from "@/server/services/flights/shape";

export type TakeoffCopy = { released: string; headline: string; note: string };

export const TRACKER_AFTER_MS = 2500;

const HEADLINES: Record<Pronoun, string> = {
  he: "And he's off",
  she: "And she's off",
  they: "And they're off",
};

const NOTE =
  "{bird} has your note for {recipient}. {He} should land around {lands}.";

export function takeoffCopy(
  flight: Flight,
  pronoun: Pronoun,
  timeZone: string,
): TakeoffCopy {
  const at = (ms: number) => clockTime(new Date(ms), timeZone);
  return {
    released: `Released ${at(flight.releaseAt)}`,
    headline: HEADLINES[pronoun],
    note: fill(
      NOTE,
      {
        bird: flight.bird.name,
        recipient: flight.counterpart?.name ?? flight.guestName,
        lands: flight.arriveAt === undefined ? undefined : at(flight.arriveAt),
      },
      pronoun,
    ),
  };
}
