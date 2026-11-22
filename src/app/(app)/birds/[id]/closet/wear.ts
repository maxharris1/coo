import type { GearId } from "@/lib/game/types";

const UNREACHABLE = "We could not reach the loft. Try again.";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export type GearBody = { items: readonly GearId[] } | { outfitId: string };

export async function putGear(
  birdId: string,
  body: GearBody,
  fetchImpl: Fetch = fetch,
): Promise<{ gear: GearId[] | null; skipped: string[] }> {
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
    const { bird, skipped } = (json ?? {}) as {
      bird?: { gear?: unknown };
      skipped?: unknown;
    };
    const gear = bird?.gear;
    return {
      gear:
        Array.isArray(gear) && gear.every((g) => typeof g === "string")
          ? (gear as GearId[])
          : null,
      skipped: Array.isArray(skipped) ? skipped.map(String) : [],
    };
  }
  const message = (json as { error?: { message?: unknown } } | null)?.error
    ?.message;
  throw new Error(
    typeof message === "string" && message ? message : UNREACHABLE,
  );
}
