import { z } from "zod";
import { clientIp } from "@/server/clientIp";
import type { createJsonRoute } from "@/server/http";
import { setLandingText } from "@/server/services/guestLinks/notify";
import { tokenAt } from "../get";

const BODY = z.object({
  phone: z.string().trim().min(1).max(30),
  consent: z.literal(true),
});

export function guestNotifyPost(
  jsonRoute: ReturnType<typeof createJsonRoute>,
  pepper: () => string,
) {
  return jsonRoute("public", { body: BODY }, ({ deps, req, input }) =>
    setLandingText(
      deps,
      pepper(),
      clientIp(req),
      tokenAt(req.nextUrl.pathname, 1),
      input,
    ),
  );
}
