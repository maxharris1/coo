import type { createJsonRoute } from "@/server/http";
import { careAction, type CareAction } from "@/server/services/care";

export type { CareAction };

export function birdCarePost(
  jsonRoute: ReturnType<typeof createJsonRoute>,
  action: CareAction,
) {
  return jsonRoute("onboarded", {}, ({ deps, caller, params }) =>
    careAction(deps, caller, params.id, action),
  );
}
