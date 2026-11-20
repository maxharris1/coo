import { z } from "zod";
import { signIn } from "@/server/auth";
import type { createJsonRoute } from "@/server/http";

export function authRoutes(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return {
    code: jsonRoute(
      "public",
      { body: z.object({ phone: z.string().max(32) }) },
      ({ auth, jar, input }) => signIn.sendCode(auth, jar, input.phone),
    ),
    verify: jsonRoute(
      "public",
      { body: z.object({ code: z.string().max(10) }) },
      ({ deps, auth, jar, input }) =>
        signIn.verifyCode({ auth, db: deps.db }, jar, input.code),
    ),
  };
}
