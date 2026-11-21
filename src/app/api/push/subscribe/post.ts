import { z } from "zod";
import type { createJsonRoute } from "@/server/http";
import { subscribe } from "@/server/services/push";

const USER_AGENT_MAX = 512;

const BODY = z.object({
  endpoint: z.url({ protocol: /^https$/ }),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

export function pushSubscribePost(
  jsonRoute: ReturnType<typeof createJsonRoute>,
) {
  return jsonRoute(
    "onboarded",
    { body: BODY },
    ({ deps, caller, input, req }) =>
      subscribe(
        deps,
        caller.userId,
        input,
        req.headers.get("user-agent")?.slice(0, USER_AGENT_MAX) ?? null,
      ),
  );
}
