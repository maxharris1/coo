import type { RecipientQuote } from "@/server/services/flights/quote";
import { call } from "../../friends/friendsApi";

type Failed = { ok: false; message: string };

export type QuoteResult = { ok: true; quote: RecipientQuote } | Failed;
export type ReleaseResult = { ok: true; flightId: string } | Failed;

const UNREACHABLE = "We could not reach the loft. Try again.";

const post = (fetchImpl: typeof fetch, path: string, body: unknown) =>
  call(fetchImpl, path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

export async function quoteFor(
  fetchImpl: typeof fetch,
  friendId: string,
  birdIds: readonly string[],
): Promise<QuoteResult> {
  const r = await post(fetchImpl, "/api/flights/quote", {
    recipients: [{ friendId }],
    birdIds,
  });
  if (!r.ok) return r;
  const quote = (r.json as { recipients?: RecipientQuote[] } | null)
    ?.recipients?.[0];
  return quote ? { ok: true, quote } : { ok: false, message: UNREACHABLE };
}

export async function release(
  fetchImpl: typeof fetch,
  send: { body: string; friendId: string; birdId: string },
): Promise<ReleaseResult> {
  const r = await post(fetchImpl, "/api/flights", {
    body: send.body,
    sends: [{ friendId: send.friendId, birdId: send.birdId }],
  });
  if (!r.ok) return r;
  const flightId = (r.json as { flights?: { id?: unknown }[] } | null)
    ?.flights?.[0]?.id;
  return typeof flightId === "string"
    ? { ok: true, flightId }
    : { ok: false, message: UNREACHABLE };
}
