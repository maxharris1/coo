import type { Units } from "@/lib/format";
import { distance } from "@/lib/format";
import type {
  FriendRow,
  Shows,
  WaitingGuestLink,
} from "@/server/services/friends";

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

export async function call(
  fetchImpl: typeof fetch,
  path: string,
  init?: RequestInit,
): Promise<{ ok: true; json: unknown } | Failed> {
  try {
    const res = await fetchImpl(path, { cache: "no-store", ...init });
    if (res.ok) return { ok: true, json: (await res.json()) as unknown };
    const json: unknown = await res.json().catch(() => null);
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
  const body = r.json as Partial<FriendsList> | null;
  if (!Array.isArray(body?.friends)) return { ok: false, message: UNREACHABLE };
  return { ok: true, friends: body.friends, guestLinks: body.guestLinks ?? [] };
}

export type ActionResult = { ok: true } | Failed;

async function perform(
  fetchImpl: typeof fetch,
  path: string,
  init: RequestInit,
): Promise<ActionResult> {
  const r = await call(fetchImpl, path, init);
  return r.ok ? { ok: true } : r;
}

export function unfriend(
  id: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ActionResult> {
  return perform(fetchImpl, `/api/friends/${id}`, { method: "DELETE" });
}

export function blockFriend(
  id: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ActionResult> {
  return perform(fetchImpl, `/api/friends/${id}/block`, { method: "POST" });
}

export function reportFriend(
  id: string,
  reason: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ActionResult> {
  return perform(fetchImpl, "/api/reports", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ userId: id, reason }),
  });
}

export async function saveShows(
  id: string,
  shows: Shows,
  fetchImpl: typeof fetch = fetch,
): Promise<{ ok: true; shows: Shows } | Failed> {
  const r = await call(fetchImpl, `/api/friends/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ shows }),
  });
  if (!r.ok) return r;
  const saved = (r.json as { friend?: { shows?: unknown } } | null)?.friend
    ?.shows;
  return saved === "city" || saved === "block"
    ? { ok: true, shows: saved }
    : { ok: false, message: UNREACHABLE };
}
