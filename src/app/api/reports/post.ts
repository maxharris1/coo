import { z } from "zod";
import type { createJsonRoute } from "@/server/http";
import type { UserId } from "@/server/ports/auth";
import { report } from "@/server/services/friends";

const reason = z.string().trim().min(1).max(500);

const BODY = z.union([
  z.object({ userId: z.uuid(), reason }).strict(),
  z.object({ guestLinkToken: z.string().min(1).max(100), reason }).strict(),
]);

export function reportsPost(
  jsonRoute: ReturnType<typeof createJsonRoute>,
  pepper: () => string,
) {
  return jsonRoute("onboarded", { body: BODY }, ({ deps, caller, input }) => {
    const { reason, ...target } = input;
    return report(
      deps,
      caller.userId,
      "userId" in target ? { userId: target.userId as UserId } : target,
      reason,
      pepper(),
    );
  });
}
