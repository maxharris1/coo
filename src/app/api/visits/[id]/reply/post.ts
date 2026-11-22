import { z } from "zod";
import type { createJsonRoute } from "@/server/http";
import { replyToVisit } from "@/server/services/visits/reply";

export function visitReplyPost(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute(
    "onboarded",
    {
      body: z
        .object({ body: z.string(), doodle: z.unknown().optional() })
        .strict(),
    },
    ({ deps, caller, params, input }) =>
      replyToVisit(deps, caller, params.id, input),
  );
}
