import { z } from "zod";
import type { createJsonRoute } from "@/server/http";
import { releaseVisit } from "@/server/services/visits/release";

export function visitReleasePost(
  jsonRoute: ReturnType<typeof createJsonRoute>,
) {
  return jsonRoute(
    "onboarded",
    { body: z.object({}).strict() },
    ({ deps, caller, params }) => releaseVisit(deps, caller, params.id),
  );
}
