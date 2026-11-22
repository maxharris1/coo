import { z } from "zod";
import { clientIp } from "@/server/clientIp";
import type { createJsonRoute } from "@/server/http";
import { claimGuestLink } from "@/server/services/guestLinks/claim";
import { tokenAt } from "../get";

export function guestClaimPost(
  jsonRoute: ReturnType<typeof createJsonRoute>,
  pepper: () => string,
) {
  return jsonRoute(
    "onboarded",
    { body: z.object({}).strict() },
    ({ deps, caller, req }) =>
      claimGuestLink(
        deps,
        caller.userId,
        pepper(),
        clientIp(req),
        tokenAt(req.nextUrl.pathname, 1),
      ),
  );
}
