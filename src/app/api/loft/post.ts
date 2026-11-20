import { z } from "zod";
import { snap } from "@/lib/game/privacy";
import type { createJsonRoute } from "@/server/http";
import { setLoft } from "@/server/services/loft";

export const COORDINATES = {
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
};

const CENTRE = { centre: z.boolean().optional() };

const BODY = z.union([
  z
    .object({ ...COORDINATES, ...CENTRE })
    .transform(({ lat, lon, centre }) => ({ roost: snap(lat, lon), centre })),
  z.object({ placeId: z.string(), ...CENTRE }),
]);

export function loftPost(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute("user", { body: BODY }, ({ deps, caller, input }) =>
    setLoft(deps, caller, input),
  );
}
