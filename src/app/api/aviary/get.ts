import type { createJsonRoute } from "@/server/http";
import { aviary } from "@/server/services/eggs";

export function aviaryGet(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute("onboarded", {}, ({ deps, caller }) => aviary(deps, caller));
}
