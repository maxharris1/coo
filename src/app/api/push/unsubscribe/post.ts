import { z } from "zod";
import type { createJsonRoute } from "@/server/http";
import { unsubscribe } from "@/server/services/push";

const BODY = z.object({ endpoint: z.string().min(1) }).strict();

export function pushUnsubscribePost(
  jsonRoute: ReturnType<typeof createJsonRoute>,
) {
  return jsonRoute("onboarded", { body: BODY }, ({ deps, caller, input }) =>
    unsubscribe(deps, caller.userId, input.endpoint),
  );
}
