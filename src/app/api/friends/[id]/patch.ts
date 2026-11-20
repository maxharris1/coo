import { z } from "zod";
import type { createJsonRoute } from "@/server/http";
import { setShows } from "@/server/services/friends";
import { friendIdFrom } from "./friendId";

const BODY = z.object({ shows: z.enum(["block", "city"]) }).strict();

export function friendPatch(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute(
    "onboarded",
    { body: BODY },
    ({ deps, caller, input, req }) =>
      setShows(deps, caller.userId, friendIdFrom(req), input.shows),
  );
}
