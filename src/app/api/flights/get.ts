import { z } from "zod";
import { parseQuery, type createJsonRoute } from "@/server/http";
import { listFlights } from "@/server/services/flights/list";

const QUERY = z.object({ cursor: z.string().optional() });

export function flightsGet(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute("onboarded", {}, ({ deps, caller, req }) =>
    listFlights(
      deps,
      { userId: caller.userId, timezone: caller.profile.timezone },
      parseQuery(req, QUERY).cursor,
    ),
  );
}
