import { AppError } from "@/server/errors";
import type { createJsonRoute } from "@/server/http";

export function realtimeTokenGet(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute("onboarded", {}, async ({ auth }) => {
    const token = await auth.accessToken();
    if (!token) throw new AppError("unauthenticated", "Sign in to continue.");
    return { token };
  });
}
