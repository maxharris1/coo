import { z } from "zod";
import { parseQuery, type createJsonRoute } from "@/server/http";
import { searchPlaces } from "@/server/services/places";

const QUERY = z.object({ q: z.string().trim().min(1).max(200) });

export function geoSearchGet(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute("user", {}, ({ deps, caller, req }) =>
    searchPlaces(deps, caller.userId, parseQuery(req, QUERY).q),
  );
}
