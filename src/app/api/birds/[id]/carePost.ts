import { z } from "zod";
import type { createJsonRoute } from "@/server/http";
import { careAction, type CareAction } from "@/server/services/care";

export type { CareAction };

const FEED_BODY = z.object({ actionId: z.uuid() }).strict();

export function birdCarePost(
  jsonRoute: ReturnType<typeof createJsonRoute>,
  action: CareAction,
) {
  if (action === "feed") {
    return jsonRoute(
      "onboarded",
      { body: FEED_BODY },
      ({ deps, caller, params, input }) =>
        careAction(deps, caller, params.id, action, input.actionId),
    );
  }
  return jsonRoute("onboarded", {}, ({ deps, caller, params }) =>
    careAction(deps, caller, params.id, action, null),
  );
}
