import { z } from "zod";
import { config } from "@/lib/config";
import type { createJsonRoute } from "@/server/http";
import { COORDINATES } from "../loft/post";
import type { UserId } from "@/server/ports/auth";
import { send } from "@/server/services/flights/send";

const SEND = z.union([
  z.object({
    friendId: z.uuid().transform((id) => id as UserId),
    birdId: z.uuid(),
    espresso: z.boolean().optional(),
  }),
  z.object({
    guest: z.object({
      name: z.string(),
      placeId: z.string(),
      pin: z.object(COORDINATES).optional(),
    }),
    birdId: z.uuid(),
    espresso: z.boolean().optional(),
  }),
]);

const BODY = z.object({
  body: z.string(),
  doodle: z.unknown().optional(),
  sends: z.array(SEND).min(1).max(config.game.limits.recipientsPerSend),
  releaseAt: z.number().int().optional(),
});

export function flightsPost(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute("onboarded", { body: BODY }, ({ deps, caller, input }) =>
    send(deps, caller.userId, input),
  );
}
