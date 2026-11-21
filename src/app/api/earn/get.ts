import { z } from "zod";
import { parseQuery, type createJsonRoute } from "@/server/http";
import { earn } from "@/server/services/earn";

const QUERY = z.object({ flight: z.uuid().optional() });

export function earnGet(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute("onboarded", {}, ({ deps, caller, req }) =>
    earn(deps, caller, { flightId: parseQuery(req, QUERY).flight }),
  );
}
