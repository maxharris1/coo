import type { createJsonRoute } from "@/server/http";
import { markAllRead } from "@/server/services/notifications";

export function notificationsReadPost(
  jsonRoute: ReturnType<typeof createJsonRoute>,
) {
  return jsonRoute("onboarded", {}, ({ deps, caller }) =>
    markAllRead(deps, caller.userId),
  );
}
