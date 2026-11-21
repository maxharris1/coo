import { z } from "zod";
import type { createJsonRoute } from "@/server/http";
import { applyClockOp } from "@/server/services/devClock";
import { tick } from "@/server/services/tick";

const MAX_ADD_MS = 30 * 24 * 60 * 60 * 1000;

const BODY = z.union([
  z
    .object({ addMs: z.int().positive().max(MAX_ADD_MS), ref: z.uuid() })
    .strict(),
  z.object({ reset: z.literal(true), ref: z.uuid() }).strict(),
  z.object({ toFlight: z.uuid(), ref: z.uuid() }).strict(),
]);

export function devClockPost(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute(
    "onboarded",
    { body: BODY, devOnly: true },
    async ({ deps, caller, input, rebuild }) => {
      const result = await applyClockOp(deps.db, input, {
        userId: caller.userId,
        now: deps.clock.now(),
      });
      const fresh = await rebuild();
      if (!("toFlight" in input)) return result;
      const { counts } = await tick(fresh, { userId: caller.userId });
      return { ...result, counts };
    },
  );
}
