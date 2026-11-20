import type { createJsonRoute } from "@/server/http";
import { listShop } from "@/server/services/shop";

export function shopGet(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute("onboarded", {}, ({ deps, caller }) =>
    listShop(deps, caller),
  );
}
