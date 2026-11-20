import type { Db } from "./db";
import { makeDeps } from "./deps";
import { AppError } from "./errors";
import type { AuthPort, UserId } from "./ports/auth";
import type { Row } from "./rows";
import { headersJar } from "./supabase/cookies";

export type Profile = Row<"profiles">;
export type Caller = { userId: UserId; profile: Profile | null };
export type OnboardedCaller = {
  userId: UserId;
  profile: Profile & { onboarded_at: Date };
};
export type Session = { auth: AuthPort; db: Db };
export type RouteKind = "api" | "public" | "app";

async function requestSession(): Promise<Session> {
  const deps = await makeDeps();
  return { auth: deps.auth(await headersJar()), db: deps.db };
}

export async function requireUser(session?: Session): Promise<Caller> {
  const { auth, db } = session ?? (await requestSession());
  const userId = await auth.currentUserId();
  if (!userId) throw new AppError("unauthenticated", "Sign in to continue.");
  const [profile] = await db.query<Profile>(
    "select * from profiles where id = $1",
    [userId],
  );
  return { userId, profile: profile ?? null };
}

export async function requireOnboarded(
  session?: Session,
): Promise<OnboardedCaller> {
  const { userId, profile } = await requireUser(session);
  if (!profile?.onboarded_at) {
    throw new AppError("not_onboarded", "Finish setting up first.");
  }
  return {
    userId,
    profile: { ...profile, onboarded_at: profile.onboarded_at },
  };
}

const ROUTES: readonly {
  kind: Exclude<RouteKind, "app">;
  exact: readonly string[];
  prefixes: readonly string[];
  slugParents: readonly string[];
}[] = [
  { kind: "api", exact: ["/api"], prefixes: ["/api/"], slugParents: [] },
  {
    kind: "public",
    exact: ["/welcome", "/sign-in", "/sign-in/verify", "/dev"],
    prefixes: [],
    slugParents: ["/dev", "/join", "/b"],
  },
];

const isSlugUnder = (path: string, parent: string) =>
  path.startsWith(`${parent}/`) &&
  /^[^/]+$/.test(path.slice(parent.length + 1));

export function routeKind(path: string): RouteKind {
  const route = ROUTES.find(
    ({ exact, prefixes, slugParents }) =>
      exact.includes(path) ||
      prefixes.some((p) => path.startsWith(p)) ||
      slugParents.some((p) => isSlugUnder(path, p)),
  );
  return route?.kind ?? "app";
}
