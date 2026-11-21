import { z } from "zod";
import type { createJsonRoute } from "@/server/http";
import { sendSearchParty } from "@/server/services/flights/searchParty";
import { flightIdFrom } from "../get";

export function flightSearchPartyPost(
  jsonRoute: ReturnType<typeof createJsonRoute>,
) {
  return jsonRoute(
    "onboarded",
    { body: z.object({}).strict() },
    async ({ deps, caller, req }) => {
      const { flight } = await sendSearchParty(deps, caller, flightIdFrom(req));
      return { flight };
    },
  );
}
