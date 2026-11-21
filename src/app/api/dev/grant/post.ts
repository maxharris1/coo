import { z } from "zod";
import type { createJsonRoute } from "@/server/http";
import { grantSeeds } from "@/server/services/devGrant";

const BODY = z
  .object({ seeds: z.int().positive().max(10_000), ref: z.uuid() })
  .strict();

export function devGrantPost(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute(
    "onboarded",
    { body: BODY, devOnly: true },
    ({ deps, caller, input }) =>
      grantSeeds(deps.db, caller.userId, input.seeds, input.ref),
  );
}
