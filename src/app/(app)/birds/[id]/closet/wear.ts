import type { GearId } from "@/lib/game/types";

const UNREACHABLE = "We could not reach the loft. Try again.";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export type GearBody = { items: readonly GearId[] } | { outfitId: string };

export async function putGear(
  birdId: string,
  body: GearBody,
  fetchImpl: Fetch = fetch,
): Promise<string[]> {
  let res: Response;
  try {
    res = await fetchImpl(`/api/birds/${encodeURIComponent(birdId)}/gear`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(UNREACHABLE);
  }
  const json: unknown = await res.json().catch(() => null);
  if (res.ok) {
    const skipped = (json as { skipped?: unknown } | null)?.skipped;
    return Array.isArray(skipped) ? skipped.map(String) : [];
  }
  const message = (json as { error?: { message?: unknown } } | null)?.error
    ?.message;
  throw new Error(
    typeof message === "string" && message ? message : UNREACHABLE,
  );
}
