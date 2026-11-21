import { z } from "zod";
import { config } from "@/lib/config";
import {
  computeFlightPlan,
  searchParty,
  type FlightInput,
  type FlightPlan,
} from "@/lib/flight/engine";
import type { OnboardedCaller } from "@/server/auth";
import type { Deps } from "@/server/deps";
import { AppError } from "@/server/errors";
import { FLIGHT_SELECT, toFlight, type Flight, type FlightRow } from "./shape";

const FLIGHT_ID = z.uuid();
const { searchPartyCost } = config.game.seeds;

export type SearchOutcome = "found" | "not_found";

type LockedFlight = {
  id: string;
  owner_id: string;
  counterpart_id: string | null;
  status: Flight["status"];
  input: FlightInput | null;
  plan: FlightPlan | null;
  search_party: SearchOutcome | null;
};

function inMajorDelay(plan: FlightPlan | null, now: number): boolean {
  if (plan?.delayKind !== "major") return false;
  const delay = plan.segments.find((s) => s.kind === "delay");
  return !!delay && delay.startMs <= now && now < delay.endMs;
}

export async function sendSearchParty(
  deps: Deps,
  caller: OnboardedCaller,
  flightId: string,
): Promise<{ flight: Flight; outcome: SearchOutcome; seeds: number }> {
  const missing = new AppError("not_found", "Could not find that flight.");
  if (!FLIGHT_ID.safeParse(flightId).success) throw missing;
  const now = deps.clock.now();
  return deps.db.tx(async (db) => {
    const [row] = await db.query<LockedFlight>(
      `select id, owner_id, counterpart_id, status, input, plan, search_party
       from flights where id = $1 for update`,
      [flightId],
    );
    if (!row || row.owner_id !== caller.userId) throw missing;
    if (row.search_party !== null) {
      throw new AppError("conflict", "A search party already went out.");
    }
    if (row.status !== "flying" || !row.input || !inMajorDelay(row.plan, now)) {
      throw new AppError("conflict", "The bird is not lost in a major delay.");
    }
    const [owner] = await db.query<{ seeds: number }>(
      "select seeds from profiles where id = $1 for update",
      [caller.userId],
    );
    if (owner.seeds < searchPartyCost) {
      throw new AppError(
        "insufficient_seeds",
        "Not enough seeds for a search party.",
      );
    }

    const [{ apply_seeds: seeds }] = await db.query<{ apply_seeds: number }>(
      "select apply_seeds($1, $2, 'search_party', $3)",
      [caller.userId, -searchPartyCost, row.id],
    );
    const override = searchParty(row.input.flightId, now);
    const outcome: SearchOutcome = override === null ? "not_found" : "found";
    if (override === null) {
      await db.query(
        "update flights set search_party = 'not_found' where id = $1",
        [row.id],
      );
    } else {
      const input: FlightInput = { ...row.input, delayEndOverrideMs: override };
      const plan = computeFlightPlan(input);
      await db.query(
        `update flights set input = $2, plan = $3, arrive_at = $4,
           search_party = 'found'
         where id = $1`,
        [
          row.id,
          JSON.stringify(input),
          JSON.stringify(plan),
          new Date(plan.arriveAtMs).toISOString(),
        ],
      );
    }
    const people = row.counterpart_id
      ? [row.owner_id, row.counterpart_id]
      : [row.owner_id];
    await db.query(
      "insert into events (user_id, kind, created_at) select unnest($1::uuid[]), 'flight', $2",
      [people, new Date(now).toISOString()],
    );
    const [updated] = await db.query<FlightRow>(
      `${FLIGHT_SELECT} where f.id = $1`,
      [row.id],
    );
    return { flight: toFlight(updated, caller.userId), outcome, seeds };
  });
}
