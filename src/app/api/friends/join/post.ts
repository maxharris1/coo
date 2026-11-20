import { z } from "zod";
import type { createJsonRoute } from "@/server/http";
import { joinByCode } from "@/server/services/friends";

const BODY = z.object({ code: z.string().min(1).max(100) }).strict();

export function friendsJoinPost(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute("onboarded", { body: BODY }, ({ deps, caller, input }) =>
    joinByCode(deps, caller.userId, input.code),
  );
}
