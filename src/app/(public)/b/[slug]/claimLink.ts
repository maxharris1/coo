export type ClaimResult =
  { ok: true; next: string } | { ok: false; message: string; retry: boolean };

const UNREACHABLE = "We could not reach the loft. Try again.";

type Claimed = { friendId: string; visitId?: unknown };

function isClaimed(json: unknown): json is Claimed {
  return typeof (json as Partial<Claimed> | null)?.friendId === "string";
}

export async function claimLink(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ClaimResult> {
  try {
    const res = await fetchImpl(`/api/guest/${token}/claim`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    if (res.ok) {
      const json: unknown = await res.json();
      if (!isClaimed(json))
        return { ok: false, message: UNREACHABLE, retry: true };
      return {
        ok: true,
        next:
          typeof json.visitId === "string" && json.visitId
            ? `/sill/${json.visitId}/reply`
            : "/shoebox",
      };
    }
    const json: unknown = await res.json().catch(() => null);
    const message = (json as { error?: { message?: unknown } } | null)?.error
      ?.message;
    return {
      ok: false,
      message: typeof message === "string" && message ? message : UNREACHABLE,
      retry: res.status >= 500 || res.status === 429,
    };
  } catch {
    return { ok: false, message: UNREACHABLE, retry: true };
  }
}
