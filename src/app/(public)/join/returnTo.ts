import { forgetLink, pendingLink } from "../b/[slug]/linkSignUp";

export const INVITE_CODE = /^[a-z0-9_]{2,20}-[\w-]{12}$/;

const COOKIE = "coo_return";

export function rememberReturn(code: string): void {
  if (!INVITE_CODE.test(code)) return;
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE}=${code}; Path=/; Max-Age=1800; SameSite=Lax${secure}`;
}

export function takeReturn(): string | null {
  const code = document.cookie
    .split("; ")
    .find((pair) => pair.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (code === undefined) return null;
  document.cookie = `${COOKIE}=; Path=/; Max-Age=0`;
  return INVITE_CODE.test(code) ? `/join/${code}` : null;
}

export function afterSignIn(next: string): string {
  const link = pendingLink();
  if (link && next !== "/") return "/welcome/bird";
  if (link) {
    forgetLink();
    return `/b/${link.token}`;
  }
  return next === "/" ? (takeReturn() ?? "/") : next;
}
