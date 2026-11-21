import type { createJsonRoute } from "@/server/http";
import { earn } from "@/server/services/earn";

export function earnGet(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute("onboarded", {}, ({ deps, caller }) => earn(deps, caller));
}
