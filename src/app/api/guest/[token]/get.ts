import { clientIp } from "@/server/clientIp";
import { AppError } from "@/server/errors";
import type { createJsonRoute } from "@/server/http";
import { getGuestLink, NO_SUCH_LINK } from "@/server/services/guestLinks/get";

export function tokenAt(pathname: string, fromEnd: number): string {
  const segments = pathname.split("/");
  try {
    return decodeURIComponent(segments[segments.length - 1 - fromEnd] ?? "");
  } catch {
    throw new AppError("not_found", NO_SUCH_LINK);
  }
}

export function guestGet(
  jsonRoute: ReturnType<typeof createJsonRoute>,
  pepper: () => string,
) {
  return jsonRoute("public", {}, ({ deps, req }) =>
    getGuestLink(
      deps,
      pepper(),
      clientIp(req),
      tokenAt(req.nextUrl.pathname, 0),
    ),
  );
}
