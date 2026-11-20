import { z } from "zod";
import { snap } from "@/lib/game/privacy";
import type { createJsonRoute } from "@/server/http";
import { setLoft } from "@/server/services/loft";

export const COORDINATES = {
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
};

const BODY = z.union([
  z
    .object(COORDINATES)
    .transform(({ lat, lon }) => ({ roost: snap(lat, lon) })),
  z.object({ placeId: z.string() }),
]);

export function loftPost(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute("user", { body: BODY }, ({ deps, caller, input }) =>
    setLoft(deps, caller, input),
  );
}
