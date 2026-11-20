import { z } from "zod";
import { requireUser } from "@/server/auth";
import type { createHandler } from "@/server/handler";
import type { SessionJar } from "@/server/ports/auth";
import { onboard } from "@/server/services/onboarding";

export function onboardingPost(
  handler: ReturnType<typeof createHandler>,
  jarFor: (req: Request) => Promise<SessionJar>,
) {
  return handler({ body: z.unknown() }, async (deps, body, req) => {
    const { userId } = await requireUser({
      auth: deps.auth(await jarFor(req)),
      db: deps.db,
    });
    return onboard(deps, userId, body);
  });
}
