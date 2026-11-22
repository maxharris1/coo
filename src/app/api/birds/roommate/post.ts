import { z } from "zod";
import type { createJsonRoute } from "@/server/http";
import { displayName, pronoun } from "@/server/services/onboarding";
import { adoptRoommate } from "@/server/services/roommate";

const BODY = z.object({ name: displayName(24), pronoun }).strict();

export function birdsRoommatePost(
  jsonRoute: ReturnType<typeof createJsonRoute>,
) {
  return jsonRoute("onboarded", { body: BODY }, ({ deps, caller, input }) =>
    adoptRoommate(deps, caller, input),
  );
}
