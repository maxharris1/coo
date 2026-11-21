import type { createJsonRoute } from "@/server/http";
import { tradeFound } from "@/server/services/jobs/found";

export function foundTradePost(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute("onboarded", {}, ({ deps, caller }) =>
    tradeFound(deps, caller),
  );
}
