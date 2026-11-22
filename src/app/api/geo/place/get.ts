import { z } from "zod";
import { parseQuery, type createJsonRoute } from "@/server/http";
import { resolvePlace } from "@/server/services/places";

const QUERY = z.object({ placeId: z.string() });

export function geoPlaceGet(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute("user", {}, async ({ deps, caller, req }) => {
    const { roost } = await resolvePlace(
      deps,
      caller.userId,
      parseQuery(req, QUERY).placeId,
    );
    return { start: { lat: roost.lat, lon: roost.lon } };
  });
}
