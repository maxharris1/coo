import { NOT_A_PHONE, toE164 } from "@/lib/phone";
import type { Db } from "./db";
import { makeDeps } from "./deps";
import { AppError } from "./errors";
import type { AuthPort, JarOptions, SessionJar, UserId } from "./ports/auth";
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

export const OTP_COOKIE = "coo_otp_phone";
const OTP_COOKIE_OPTIONS: JarOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/api/auth",
  maxAge: 600,
};
export const WRONG_CODE = "That's not it. Try once more.";
export type SignInNext = "/welcome/install" | "/";

async function sendCode(
  auth: AuthPort,
  jar: SessionJar,
  raw: string,
): Promise<{ next: "/sign-in/verify" }> {
  const phone = toE164(raw);
  if (!phone) throw new AppError("invalid", NOT_A_PHONE);
  await auth.sendCode(phone);
  jar.setAll([{ name: OTP_COOKIE, value: phone, options: OTP_COOKIE_OPTIONS }]);
  return { next: "/sign-in/verify" };
}

async function verifyCode(
  { auth, db }: Session,
  jar: SessionJar,
  code: string,
): Promise<{ next: SignInNext }> {
  const pending = jar.getAll().find((c) => c.name === OTP_COOKIE);
  const phone = pending && toE164(pending.value);
  if (!phone) throw new AppError("invalid", "Send it again for a new code.");
  const userId = await auth.verifyCode(phone, code);
  if (!userId) throw new AppError("invalid", WRONG_CODE);
  jar.setAll([
    {
      name: OTP_COOKIE,
      value: "",
      options: { ...OTP_COOKIE_OPTIONS, maxAge: 0 },
    },
  ]);
  const [profile] = await db.query<Pick<Profile, "onboarded_at">>(
    "select onboarded_at from profiles where id = $1",
    [userId],
  );
  return { next: profile?.onboarded_at ? "/" : "/welcome/install" };
}

async function signOut(auth: AuthPort): Promise<object> {
  await auth.signOut();
  return {};
}

export const signIn = { sendCode, verifyCode, signOut };

const ROUTES: readonly {
  kind: Exclude<RouteKind, "app">;
  exact: readonly string[];
  prefixes: readonly string[];
  slugParents: readonly string[];
}[] = [
  { kind: "api", exact: ["/api"], prefixes: ["/api/"], slugParents: [] },
  {
    kind: "public",
    exact: ["/welcome", "/sign-in", "/sign-in/verify", "/offline", "/dev"],
    prefixes: [],
    slugParents: ["/dev", "/join", "/b"],
  },
];

const isSlugUnder = (path: string, parent: string) =>
  path.startsWith(`${parent}/`) &&
  /^[^/]+$/.test(path.slice(parent.length + 1));

function decodePath(path: string) {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

export function routeKind(rawPath: string): RouteKind {
  const path = decodePath(rawPath);
  const route = ROUTES.find(
    ({ exact, prefixes, slugParents }) =>
      exact.includes(path) ||
      prefixes.some((p) => path.startsWith(p)) ||
      slugParents.some((p) => isSlugUnder(path, p)),
  );
  return route?.kind ?? "app";
}
