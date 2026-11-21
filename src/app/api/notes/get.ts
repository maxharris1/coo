import { z } from "zod";
import { parseQuery, type createJsonRoute } from "@/server/http";
import { listNotes } from "@/server/services/notes";

const QUERY = z.object({
  friendId: z.uuid().optional(),
  cursor: z.string().max(200).optional(),
});

export function notesGet(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute("onboarded", {}, ({ deps, caller, req }) =>
    listNotes(deps, caller.userId, parseQuery(req, QUERY)),
  );
}
