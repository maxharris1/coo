import { z } from "zod";
import { snap } from "@/lib/game/privacy";
import type { createJsonRoute } from "@/server/http";
import { setTravel, type TravelInput } from "@/server/services/loft";
import { COORDINATES } from "../post";

const BODY = z.union([
  z
    .object({ on: z.literal(true), ...COORDINATES })
    .transform(({ lat, lon }): TravelInput => ({
      on: true,
      roost: snap(lat, lon),
    })),
  z.object({ on: z.literal(true), placeId: z.string() }),
  z.object({ on: z.literal(false) }),
]);

export function loftTravelPost(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute("onboarded", { body: BODY }, ({ deps, caller, input }) =>
    setTravel(deps, caller.userId, input),
  );
}
