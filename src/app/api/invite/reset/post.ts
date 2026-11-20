import type { createJsonRoute } from "@/server/http";
import { resetInvite } from "@/server/services/friends";

export function inviteResetPost(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute("onboarded", {}, ({ deps, caller }) =>
    resetInvite(deps, caller.userId),
  );
}
