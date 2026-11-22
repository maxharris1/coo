import type { RecipientQuote } from "@/server/services/flights/quote";
import { call } from "../../friends/friendsApi";

type Failed = { ok: false; message: string };

export type QuoteResult = { ok: true; quotes: RecipientQuote[] } | Failed;
export type ReleaseResult = { ok: true; flightIds: string[] } | Failed;
export type Send = { friendId: string; birdId: string };

const UNREACHABLE = "We could not reach the loft. Try again.";

const post = (fetchImpl: typeof fetch, path: string, body: unknown) =>
  call(fetchImpl, path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

export async function quoteFor(
  fetchImpl: typeof fetch,
  friendIds: readonly string[],
  birdIds: readonly string[],
): Promise<QuoteResult> {
  const r = await post(fetchImpl, "/api/flights/quote", {
    recipients: friendIds.map((friendId) => ({ friendId })),
    birdIds,
  });
  if (!r.ok) return r;
  const quotes = (r.json as { recipients?: RecipientQuote[] } | null)
    ?.recipients;
  return quotes?.length
    ? { ok: true, quotes }
    : { ok: false, message: UNREACHABLE };
}

export async function release(
  fetchImpl: typeof fetch,
  send: { body: string; sends: readonly Send[] },
): Promise<ReleaseResult> {
  const r = await post(fetchImpl, "/api/flights", send);
  if (!r.ok) return r;
  const ids = (
    (r.json as { flights?: { id?: unknown }[] } | null)?.flights ?? []
  ).map((f) => f.id);
  const flightIds = ids.filter((id): id is string => typeof id === "string");
  return flightIds.length > 0 && flightIds.length === ids.length
    ? { ok: true, flightIds }
    : { ok: false, message: UNREACHABLE };
}
