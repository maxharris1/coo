import { z } from "zod";
import { snap } from "@/lib/game/privacy";
import type { createJsonRoute } from "@/server/http";
import { setTravel, type TravelInput } from "@/server/services/loft";
import { COORDINATES } from "../post";

const BODY = z
  .discriminatedUnion("on", [
    z.object({ on: z.literal(true), ...COORDINATES }),
    z.object({ on: z.literal(false) }),
  ])
  .transform((body): TravelInput =>
    body.on ? { on: true, roost: snap(body.lat, body.lon) } : { on: false },
  );

export function loftTravelPost(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute("onboarded", { body: BODY }, ({ deps, caller, input }) =>
    setTravel(deps, caller.userId, input),
  );
}
