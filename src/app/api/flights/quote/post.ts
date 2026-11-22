import { z } from "zod";
import type { createJsonRoute } from "@/server/http";
import { COORDINATES } from "../../loft/post";
import type { UserId } from "@/server/ports/auth";
import { quote } from "@/server/services/flights/quote";

const RECIPIENT = z.union([
  z.object({ friendId: z.uuid().transform((id) => id as UserId) }),
  z.object({
    place: z.object({
      placeId: z.string(),
      pin: z.object(COORDINATES).optional(),
    }),
  }),
]);

const BODY = z.object({
  recipients: z.array(RECIPIENT).min(1),
  birdIds: z.array(z.uuid()).optional(),
  at: z.array(z.number().int()).optional(),
});

export function quotePost(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute("onboarded", { body: BODY }, ({ deps, caller, input }) =>
    quote(deps, caller.userId, input),
  );
}
