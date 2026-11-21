import { z } from "zod";
import type { createJsonRoute } from "@/server/http";
import { applyClockOp } from "@/server/services/devClock";

const MAX_ADD_MS = 30 * 24 * 60 * 60 * 1000;

const BODY = z.union([
  z
    .object({ addMs: z.int().positive().max(MAX_ADD_MS), ref: z.uuid() })
    .strict(),
  z.object({ reset: z.literal(true), ref: z.uuid() }).strict(),
]);

export function devClockPost(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute(
    "onboarded",
    { body: BODY, devOnly: true },
    async ({ deps, input, rebuild }) => {
      const result = await applyClockOp(deps.db, input);
      await rebuild();
      return result;
    },
  );
}
