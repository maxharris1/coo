import type { createJsonRoute } from "@/server/http";
import { unfriend } from "@/server/services/friends";
import { friendIdFrom } from "./friendId";

export function friendDelete(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute("onboarded", {}, ({ deps, caller, req }) =>
    unfriend(deps, caller.userId, friendIdFrom(req)),
  );
}
