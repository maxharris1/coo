import type { RecipientQuote } from "@/server/services/flights/quote";
import { call } from "../../friends/friendsApi";
import type { QuoteResult, ReleaseResult } from "../write/composeApi";
import type { ForecastDraft } from "./draft";

const UNREACHABLE = "We could not reach the loft. Try again.";

const post = (fetchImpl: typeof fetch, path: string, body: unknown) =>
  call(fetchImpl, path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

export async function quoteAt(
  fetchImpl: typeof fetch,
  friendId: string,
  birdId: string,
  at: readonly number[],
): Promise<QuoteResult> {
  const r = await post(fetchImpl, "/api/flights/quote", {
    recipients: [{ friendId }],
    birdIds: [birdId],
    at,
  });
  if (!r.ok) return r;
  const quote = (r.json as { recipients?: RecipientQuote[] } | null)
    ?.recipients?.[0];
  return quote ? { ok: true, quote } : { ok: false, message: UNREACHABLE };
}

export async function send(
  fetchImpl: typeof fetch,
  draft: ForecastDraft,
  releaseAt: number | undefined,
): Promise<ReleaseResult> {
  const r = await post(fetchImpl, "/api/flights", {
    body: draft.body,
    sends: [{ friendId: draft.friendId, birdId: draft.birdId }],
    releaseAt,
  });
  if (!r.ok) return r;
  const flightId = (r.json as { flights?: { id?: unknown }[] } | null)
    ?.flights?.[0]?.id;
  return typeof flightId === "string"
    ? { ok: true, flightId }
    : { ok: false, message: UNREACHABLE };
}
