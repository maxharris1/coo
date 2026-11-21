import type { createJsonRoute } from "@/server/http";
import { health } from "@/server/services/health";

export function healthGet(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute("public", {}, ({ deps }) => health(deps));
}
