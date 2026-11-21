import { createHash, timingSafeEqual } from "node:crypto";
import { AppError } from "@/server/errors";
import type { createJsonRoute } from "@/server/http";
import { tick } from "@/server/services/tick";

const sha256 = (s: string) => createHash("sha256").update(s).digest();

// Comparing digests keeps both buffers the same length, so timingSafeEqual never throws or leaks the secret's length.
function secretMatches(header: string | null, secret: string): boolean {
  return timingSafeEqual(sha256(header ?? ""), sha256(`Bearer ${secret}`));
}

export function cronTickPost(
  jsonRoute: ReturnType<typeof createJsonRoute>,
  secret: () => string,
) {
  return jsonRoute("public", {}, async ({ deps, req }) => {
    if (!secretMatches(req.headers.get("authorization"), secret())) {
      throw new AppError("unauthenticated", "Missing or wrong cron secret.");
    }
    return tick(deps);
  });
}
