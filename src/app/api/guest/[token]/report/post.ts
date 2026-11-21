import { z } from "zod";
import { clientIp } from "@/server/clientIp";
import type { createJsonRoute } from "@/server/http";
import { reportGuestLink } from "@/server/services/guestLinks/report";
import { tokenAt } from "../get";

const BODY = z.object({ reason: z.string().trim().min(1).max(500) });

export function guestReportPost(
  jsonRoute: ReturnType<typeof createJsonRoute>,
  pepper: () => string,
) {
  return jsonRoute("public", { body: BODY }, ({ deps, req, input }) =>
    reportGuestLink(
      deps,
      pepper(),
      clientIp(req),
      tokenAt(req.nextUrl.pathname, 1),
      input.reason,
    ),
  );
}
