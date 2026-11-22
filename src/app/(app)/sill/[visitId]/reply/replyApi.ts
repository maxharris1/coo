import type { Doodle } from "@/lib/game/notes";
import type { Flight } from "@/server/services/flights/shape";
import type { FriendRow } from "@/server/services/friends";
import { call } from "../../../friends/friendsApi";

export type ReplyResult =
  { ok: true; flight: Flight } | { ok: false; message: string };

const UNREACHABLE = "We could not reach the loft. Try again.";

export async function postReply(
  fetcher: typeof fetch,
  visitId: string,
  body: string,
  doodle: Doodle | null,
): Promise<ReplyResult> {
  const r = await call(
    fetcher,
    `/api/visits/${encodeURIComponent(visitId)}/reply`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(doodle ? { body, doodle } : { body }),
    },
  );
  if (!r.ok) return r;
  const flight = (r.json as { flight?: Flight } | null)?.flight;
  return flight ? { ok: true, flight } : { ok: false, message: UNREACHABLE };
}

export async function friendRow(
  fetcher: typeof fetch,
  ownerId: string,
): Promise<FriendRow | undefined> {
  const r = await call(fetcher, "/api/friends");
  if (!r.ok) return undefined;
  const friends = (r.json as { friends?: FriendRow[] } | null)?.friends ?? [];
  return friends.find((f) => f.id === ownerId);
}
