import type { Units } from "@/lib/format";
import { distance } from "@/lib/format";
import type { FriendRow, WaitingGuestLink } from "@/server/services/friends";

export type FriendsList = {
  friends: FriendRow[];
  guestLinks: WaitingGuestLink[];
};

type Failed = { ok: false; message: string };

const UNREACHABLE = "We could not reach the loft. Try again.";
const KM_PER_MILE = 1.609344;
const CLOSE_BELOW = 0.5;

export function friendLine(friend: FriendRow, units: Units): string {
  const { where, distanceMi } = friend;
  if (distanceMi === null) return where ?? "No roost yet";
  const local = units === "km" ? distanceMi * KM_PER_MILE : distanceMi;
  if (local < CLOSE_BELOW) return `${distance(distanceMi, units)} over`;
  const far = `${Math.round(local)} ${units}`;
  return where ? `${where}, ${far}` : far;
}

async function call(
  fetchImpl: typeof fetch,
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; json: unknown } | Failed> {
  try {
    const res = await fetchImpl(path, { cache: "no-store", ...init });
    const json: unknown = await res.json().catch(() => null);
    if (res.ok) return { ok: true, json };
    const message = (json as { error?: { message?: unknown } } | null)?.error
      ?.message;
    return {
      ok: false,
      message: typeof message === "string" && message ? message : UNREACHABLE,
    };
  } catch {
    return { ok: false, message: UNREACHABLE };
  }
}

export async function loadFriends(
  fetchImpl: typeof fetch = fetch,
): Promise<({ ok: true } & FriendsList) | Failed> {
  const r = await call(fetchImpl, "/api/friends");
  if (!r.ok) return r;
  const { friends, guestLinks } = r.json as FriendsList;
  return { ok: true, friends, guestLinks };
}
