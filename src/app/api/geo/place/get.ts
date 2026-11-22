import { z } from "zod";
import { parseQuery, type createJsonRoute } from "@/server/http";
import { placeStart } from "@/server/services/places";

const QUERY = z.object({ placeId: z.string() });

export function geoPlaceGet(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute("user", {}, ({ deps, caller, req }) =>
    placeStart(deps, caller.userId, parseQuery(req, QUERY).placeId),
  );
}
