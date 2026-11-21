import { z } from "zod";
import type { createJsonRoute } from "@/server/http";
import { renameBird } from "@/server/services/care";
import { displayName, pronoun } from "@/server/services/onboarding";

const BODY = z
  .object({ name: displayName(24).optional(), pronoun: pronoun.optional() })
  .strict()
  .refine((b) => b.name !== undefined || b.pronoun !== undefined);

export function birdPatch(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute(
    "onboarded",
    { body: BODY },
    ({ deps, caller, input, params }) =>
      renameBird(deps, caller, params.id, input),
  );
}
