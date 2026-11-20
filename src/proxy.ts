import { NextResponse, type NextRequest } from "next/server";
import { routeKind } from "@/server/auth";
import { makeDeps } from "@/server/deps";
import { requestJar } from "@/server/supabase/cookies";

export async function proxy(req: NextRequest) {
  const { jar, commit } = requestJar(req);
  // Reading the user refreshes an expiring session, so this runs on every matched path, not only app pages.
  const userId = await (await makeDeps()).auth(jar).currentUserId();
  if (!userId && routeKind(req.nextUrl.pathname) === "app") {
    return commit(NextResponse.redirect(new URL("/welcome", req.url), 307));
  }
  return commit(NextResponse.next({ request: req }));
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|assets/|map/|.*\\.(?:svg|png|jpe?g|gif|webp|avif|ico|css|js|json|webmanifest|txt|xml|woff2?|ttf|otf)$).*)",
  ],
};
