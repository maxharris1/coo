import type { Flight } from "@/server/services/flights/shape";

export type FlightResult =
  { ok: true; flight: Flight } | { ok: false; code: string };

export async function loadFlight(
  fetchFn: typeof fetch,
  id: string,
): Promise<FlightResult> {
  try {
    const res = await fetchFn(`/api/flights/${encodeURIComponent(id)}`, {
      cache: "no-store",
    });
    const json: unknown = await res.json().catch(() => null);
    if (res.ok) {
      const body = json as { flight: Flight };
      return { ok: true, flight: body.flight };
    }
    const code = (json as { error?: { code?: unknown } } | null)?.error?.code;
    return { ok: false, code: typeof code === "string" ? code : "unreachable" };
  } catch {
    return { ok: false, code: "unreachable" };
  }
}
