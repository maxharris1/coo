import { z } from "zod";
import type { createJsonRoute } from "@/server/http";
import { MAX_OUTFITS, saveOutfits } from "@/server/services/gear";

const BODY = z
  .object({
    outfits: z
      .array(
        z
          .object({
            id: z.string().uuid().optional(),
            name: z.string().trim().min(1).max(20),
            items: z.array(z.string().min(1).max(100)).max(20),
          })
          .strict(),
      )
      .max(MAX_OUTFITS),
  })
  .strict();

export function outfitsPut(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute("onboarded", { body: BODY }, ({ deps, caller, input }) =>
    saveOutfits(deps, caller, input),
  );
}
