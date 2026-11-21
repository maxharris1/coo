import type { FlightsPage } from "@/server/services/flights/list";
import type { Flight } from "@/server/services/flights/shape";
import { call } from "../../../friends/friendsApi";

type Failed = { ok: false; message: string };

const UNREACHABLE = "We could not reach the loft. Try again.";

export async function delayedCount(
  fetchImpl: typeof fetch,
): Promise<{ ok: true; count: number } | Failed> {
  const delayed = new Set<string>();
  let cursor: string | null = null;
  do {
    const path: string =
      cursor === null
        ? "/api/flights"
        : `/api/flights?${new URLSearchParams({ cursor })}`;
    const r = await call(fetchImpl, path);
    if (!r.ok) return r;
    const page = r.json as FlightsPage;
    for (const f of [
      ...page.yours,
      ...page.incoming,
      ...page.landedToday,
      ...page.earlier,
    ]) {
      if (f.role === "mine" && f.plan?.delayed) delayed.add(f.id);
    }
    cursor = page.nextCursor;
  } while (cursor !== null);
  return { ok: true, count: delayed.size };
}

export async function sendSearchParty(
  fetchImpl: typeof fetch,
  id: string,
): Promise<{ ok: true; flight: Flight } | Failed> {
  const r = await call(
    fetchImpl,
    `/api/flights/${encodeURIComponent(id)}/search-party`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    },
  );
  if (!r.ok) return r;
  const flight = (r.json as { flight?: Flight } | null)?.flight;
  return flight ? { ok: true, flight } : { ok: false, message: UNREACHABLE };
}
