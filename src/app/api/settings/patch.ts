import { z } from "zod";
import type { createJsonRoute } from "@/server/http";
import { updateSettings } from "@/server/services/settings";

const BODY = z
  .object({ installed: z.literal(true), account: z.string().uuid().optional() })
  .strict();

export function settingsPatch(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute("onboarded", { body: BODY }, ({ deps, caller, input }) =>
    updateSettings(deps, caller.userId, input),
  );
}
