import type { CareAction } from "@/server/services/care";

const UNREACHABLE = "We could not reach the loft. Try again.";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export type BirdTap = CareAction | "wake";

const request = (action: BirdTap): RequestInit =>
  action === "feed"
    ? {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ actionId: crypto.randomUUID() }),
      }
    : { method: "POST" };

export async function postCare(
  birdId: string,
  action: BirdTap,
  fetchImpl: Fetch = fetch,
): Promise<void> {
  let res: Response;
  try {
    res = await fetchImpl(
      `/api/birds/${encodeURIComponent(birdId)}/${action}`,
      request(action),
    );
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

export function feedBird(birdId: string, fetchImpl: Fetch = fetch) {
  return postCare(birdId, "feed", fetchImpl);
}
