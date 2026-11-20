import type { createJsonRoute } from "@/server/http";
import { sync } from "@/server/services/sync";

export function syncGet(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute("onboarded", {}, ({ deps, caller, req }) =>
    sync(deps, caller, req.headers.get("x-timezone")),
  );
}
