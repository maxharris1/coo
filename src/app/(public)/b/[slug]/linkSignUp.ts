import type { Roost } from "@/app/(app)/welcome/loft/roost";
import type { E164 } from "@/lib/phone";
import type { GuestView } from "@/server/services/guestLinks/get";
import { forgetReturn } from "../../join/returnTo";
import { claimLink } from "./claimLink";

export type LinkSignUp = { token: string; name: string; phone: E164 };

export type LinkFinish =
  | { kind: "none" }
  | { kind: "go"; to: string }
  | { kind: "retry"; message: string };

const KEY = "coo_link";
const KEEP_MS = 30 * 60_000;
const TOKEN = /^[A-Za-z0-9]{1,64}$/;

export function rememberLink(link: LinkSignUp, now = Date.now()): void {
  if (!TOKEN.test(link.token)) return;
  forgetReturn();
  sessionStorage.setItem(KEY, JSON.stringify({ ...link, at: now }));
}

export function pendingLink(now = Date.now()): LinkSignUp | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as
      (LinkSignUp & { at: number }) | null;
    if (!saved || !TOKEN.test(saved.token) || now - saved.at > KEEP_MS)
      return null;
    return { token: saved.token, name: saved.name, phone: saved.phone };
  } catch {
    return null;
  }
}

export function forgetLink(): void {
  sessionStorage.removeItem(KEY);
}

export async function linkRoost(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Roost | null> {
  try {
    const res = await fetchImpl(`/api/guest/${token}`);
    if (!res.ok) return null;
    const { lat, lon, label } = ((await res.json()) as GuestView).flight.to;
    return { lat, lon, label, city: null };
  } catch {
    return null;
  }
}

export async function finishLinkSignUp(
  fetchImpl: typeof fetch = fetch,
): Promise<LinkFinish> {
  const link = pendingLink();
  if (!link) return { kind: "none" };
  const claimed = await claimLink(link.token, fetchImpl);
  if (!claimed.ok && claimed.retry)
    return { kind: "retry", message: claimed.message };
  forgetLink();
  return { kind: "go", to: claimed.ok ? claimed.next : "/" };
}
