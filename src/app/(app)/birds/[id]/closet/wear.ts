import type { GearId } from "@/lib/game/types";

const UNREACHABLE = "We could not reach the loft. Try again.";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export async function putGear(
  birdId: string,
  items: readonly GearId[],
  fetchImpl: Fetch = fetch,
): Promise<void> {
  let res: Response;
  try {
    res = await fetchImpl(`/api/birds/${encodeURIComponent(birdId)}/gear`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items }),
    });
  } catch {
    throw new Error(UNREACHABLE);
  }
  if (res.ok) return;
  const json: unknown = await res.json().catch(() => null);
  const message = (json as { error?: { message?: unknown } } | null)?.error
    ?.message;
  throw new Error(
    typeof message === "string" && message ? message : UNREACHABLE,
  );
}
