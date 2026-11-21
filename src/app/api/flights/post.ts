import type { createJsonRoute } from "@/server/http";
import { AppError } from "@/server/errors";

export function flightsPost(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute("onboarded", {}, async () => {
    throw new AppError("not_found", "Flights are not built yet.");
  });
}
