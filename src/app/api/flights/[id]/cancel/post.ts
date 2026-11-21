import { z } from "zod";
import type { createJsonRoute } from "@/server/http";
import { cancelFlight } from "@/server/services/flights/cancel";
import { flightIdFrom } from "../get";

export function flightCancelPost(
  jsonRoute: ReturnType<typeof createJsonRoute>,
) {
  return jsonRoute(
    "onboarded",
    { body: z.object({}).strict() },
    async ({ deps, caller, req }) => {
      const { flight } = await cancelFlight(
        deps,
        caller.userId,
        flightIdFrom(req),
      );
      return { flight };
    },
  );
}
