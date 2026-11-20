import { z } from "zod";
import type { createJsonRoute } from "@/server/http";
import { putGear } from "@/server/services/gear";

const BODY = z
  .object({ items: z.array(z.string().min(1).max(100)).max(20) })
  .strict();

export function birdGearPut(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute(
    "onboarded",
    { body: BODY },
    ({ deps, caller, input, params }) =>
      putGear(deps, caller, params.id, input),
  );
}
