import { WELCOME_STEPS } from "@/app/(app)/welcome/steps";
import { forgetLink, pendingLink } from "../b/[slug]/linkSignUp";

export const INVITE_CODE = /^[a-z0-9_]{2,20}-[\w-]{12}$/;

const COOKIE = "coo_return";

export function rememberReturn(code: string): void {
  if (!INVITE_CODE.test(code)) return;
  forgetLink();
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE}=${code}; Path=/; Max-Age=1800; SameSite=Lax${secure}`;
}

export function takeReturn(): string | null {
  const code = document.cookie
    .split("; ")
    .find((pair) => pair.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (code === undefined) return null;
  forgetReturn();
  return INVITE_CODE.test(code) ? `/join/${code}` : null;
}

export function forgetReturn(): void {
  document.cookie = `${COOKIE}=; Path=/; Max-Age=0`;
}

export function afterSignIn(next: string): string {
  if (next !== "/") return WELCOME_STEPS[0];
  const link = pendingLink();
  if (link) {
    forgetLink();
    return `/b/${link.token}`;
  }
  return takeReturn() ?? "/";
}
