import type { createJsonRoute } from "@/server/http";
import { listFriends } from "@/server/services/friends";

export function friendsGet(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute("onboarded", {}, ({ deps, caller }) =>
    listFriends(deps, caller.userId),
  );
}
