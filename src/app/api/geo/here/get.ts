import { z } from "zod";
import { snap } from "@/lib/game/privacy";
import { parseQuery, type createJsonRoute } from "@/server/http";
import { placeHere } from "@/server/services/places";

const coordinate = (limit: number) =>
  z
    .string()
    .trim()
    .min(1)
    .transform(Number)
    .pipe(z.number().min(-limit).max(limit));

const QUERY = z
  .object({ lat: coordinate(90), lon: coordinate(180) })
  .transform(({ lat, lon }) => snap(lat, lon));

export function geoHereGet(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute("user", {}, ({ deps, req }) =>
    placeHere(deps, parseQuery(req, QUERY)),
  );
}
