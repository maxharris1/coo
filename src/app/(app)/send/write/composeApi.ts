import type {
  QuoteRecipient,
  RecipientQuote,
} from "@/server/services/flights/quote";
import { call } from "../../friends/friendsApi";
import type { Guest } from "./guest";

type Failed = { ok: false; message: string };

export type QuoteResult = { ok: true; quotes: RecipientQuote[] } | Failed;
export type GuestLink = { flightId: string; url: string };
export type ReleaseResult =
  { ok: true; flightIds: string[]; links: GuestLink[] } | Failed;
export type Send =
  { friendId: string; birdId: string } | { guest: Guest; birdId: string };

const UNREACHABLE = "We could not reach the loft. Try again.";

const post = (fetchImpl: typeof fetch, path: string, body: unknown) =>
  call(fetchImpl, path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

export async function quoteFor(
  fetchImpl: typeof fetch,
  recipients: readonly QuoteRecipient[],
  birdIds: readonly string[],
): Promise<QuoteResult> {
  const r = await post(fetchImpl, "/api/flights/quote", {
    recipients,
    birdIds,
  });
  if (!r.ok) return r;
  const quotes = (r.json as { recipients?: RecipientQuote[] } | null)
    ?.recipients;
  return quotes?.length
    ? { ok: true, quotes }
    : { ok: false, message: UNREACHABLE };
}

function isLink(l: unknown): l is GuestLink {
  const { flightId, url } = (l ?? {}) as Partial<GuestLink>;
  return typeof flightId === "string" && typeof url === "string";
}

export async function release(
  fetchImpl: typeof fetch,
  send: { body: string; sends: readonly Send[] },
): Promise<ReleaseResult> {
  const r = await post(fetchImpl, "/api/flights", send);
  if (!r.ok) return r;
  const reply = r.json as {
    flights?: { id?: unknown }[];
    guestLinks?: unknown[];
  } | null;
  const ids = (reply?.flights ?? []).map((f) => f.id);
  const flightIds = ids.filter((id): id is string => typeof id === "string");
  return flightIds.length > 0 && flightIds.length === ids.length
    ? { ok: true, flightIds, links: (reply?.guestLinks ?? []).filter(isLink) }
    : { ok: false, message: UNREACHABLE };
}
