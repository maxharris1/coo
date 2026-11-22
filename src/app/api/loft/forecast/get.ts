import type { createJsonRoute } from "@/server/http";
import { tomorrowAtLoft } from "@/server/services/forecast";

export function loftForecastGet(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute("onboarded", {}, ({ deps, caller }) =>
    tomorrowAtLoft(deps, caller.userId),
  );
}
