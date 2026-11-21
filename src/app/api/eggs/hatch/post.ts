import { z } from "zod";
import type { createJsonRoute } from "@/server/http";
import { hatchOpenEgg } from "@/server/services/eggs";
import { displayName, pronoun } from "@/server/services/onboarding";

const BODY = z.object({ name: displayName(24), pronoun }).strict();

export function eggsHatchPost(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute("onboarded", { body: BODY }, ({ deps, caller, input }) =>
    hatchOpenEgg(deps, caller, input),
  );
}
