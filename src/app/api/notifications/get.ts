import type { createJsonRoute } from "@/server/http";
import { listNotifications } from "@/server/services/notifications";

export function notificationsGet(
  jsonRoute: ReturnType<typeof createJsonRoute>,
) {
  return jsonRoute("onboarded", {}, ({ deps, caller }) =>
    listNotifications(deps, caller.userId),
  );
}
