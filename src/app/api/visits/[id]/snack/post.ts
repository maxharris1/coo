import { z } from "zod";
import type { createJsonRoute } from "@/server/http";
import { snackVisit } from "@/server/services/visits/snack";

export function visitSnackPost(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute(
    "onboarded",
    { body: z.object({}).strict() },
    ({ deps, caller, params }) => snackVisit(deps, caller, params.id),
  );
}
