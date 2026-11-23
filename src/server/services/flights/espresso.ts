import { computeFlightPlan, type FlightInput } from "@/lib/flight/engine";
import type { Db } from "@/server/db";
import { AppError } from "@/server/errors";
import type { UserId } from "@/server/ports/auth";

export function espressoUntil(input: FlightInput): number | null {
  if (input.gear.includes("nightgoggles")) return null;
  const plan = computeFlightPlan({
    ...input,
    nightFlightUntilMs: undefined,
    delayEndOverrideMs: input.departAtMs,
  });
  return plan.segments.find((s) => s.kind === "roost")?.endMs ?? null;
}

export function withEspresso(input: FlightInput): {
  input: FlightInput;
  used: boolean;
} {
  const until = espressoUntil(input);
  return until === null
    ? { input, used: false }
    : { input: { ...input, nightFlightUntilMs: until }, used: true };
}

export function espressoInput(
  wanted: boolean | undefined,
  input: FlightInput,
): { input: FlightInput; used: boolean } {
  return wanted ? withEspresso(input) : { input, used: false };
}

export async function spendShot(tx: Db, me: UserId): Promise<void> {
  const spent = await tx.query(
    `update profiles set espresso_shots = espresso_shots - 1
     where id = $1 and espresso_shots >= 1 returning id`,
    [me],
  );
  if (spent.length === 0)
    throw new AppError("conflict", "No espresso shots left.");
}
