import { z } from "zod";
import type { createJsonRoute } from "@/server/http";
import { buy } from "@/server/services/shop";

const BODY = z.object({ itemId: z.string().min(1).max(40) }).strict();

export function shopBuyPost(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute("onboarded", { body: BODY }, ({ deps, caller, input }) =>
    buy(deps, caller.userId, input),
  );
}
