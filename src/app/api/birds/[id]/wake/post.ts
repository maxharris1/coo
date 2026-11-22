import type { createJsonRoute } from "@/server/http";
import { wakeBird } from "@/server/services/care";

export function birdWakePost(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute("onboarded", {}, ({ deps, caller, params }) =>
    wakeBird(deps, caller, params.id),
  );
}
