import type { createJsonRoute } from "@/server/http";
import { block } from "@/server/services/friends";
import { friendIdFrom } from "../friendId";

export function friendBlockPost(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute("onboarded", {}, ({ deps, caller, req }) =>
    block(deps, caller.userId, friendIdFrom(req)),
  );
}
