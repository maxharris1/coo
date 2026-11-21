import type { createJsonRoute } from "@/server/http";
import { getCollection } from "@/server/services/collection";

export function collectionGet(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute("onboarded", {}, ({ deps, caller }) =>
    getCollection(deps, caller.userId),
  );
}
