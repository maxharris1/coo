import { AppError } from "@/server/errors";
import type { createJsonRoute } from "@/server/http";
import { inviterFor } from "@/server/services/friends";

function codeFrom(pathname: string): string {
  try {
    return decodeURIComponent(pathname.slice(pathname.lastIndexOf("/") + 1));
  } catch {
    throw new AppError("not_found", "No one has that code");
  }
}

export function inviteGet(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute("public", {}, ({ deps, req }) =>
    inviterFor(deps.db, codeFrom(req.nextUrl.pathname)),
  );
}
