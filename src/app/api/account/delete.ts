import { z } from "zod";
import type { createJsonRoute } from "@/server/http";
import { AppError } from "@/server/errors";
import { deleteAccount } from "@/server/services/account";

const BODY = z.object({ confirm: z.string().max(64) }).strict();

export function accountDelete(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute(
    "onboarded",
    { body: BODY },
    async ({ deps, auth, caller, input }) => {
      if (input.confirm.trim().toLowerCase() !== caller.profile.handle) {
        throw new AppError("invalid", "confirm: type your handle to delete");
      }
      const result = await deleteAccount(deps, caller);
      await auth.signOut();
      return result;
    },
  );
}
