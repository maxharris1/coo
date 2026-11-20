import { z } from "zod";
import type { createJsonRoute } from "@/server/http";
import { onboard } from "@/server/services/onboarding";

export function onboardingPost(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute("user", { body: z.unknown() }, ({ deps, caller, input }) =>
    onboard(deps, caller.userId, input),
  );
}
