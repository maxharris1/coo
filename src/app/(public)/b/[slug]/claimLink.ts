export type ClaimResult =
  { ok: true; next: string } | { ok: false; message: string };

const UNREACHABLE = "We could not reach the loft. Try again.";

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
    const json: unknown = await res.json().catch(() => null);
    if (res.ok) {
      const visitId = (json as { visitId?: unknown } | null)?.visitId;
      return {
        ok: true,
        next:
          typeof visitId === "string" && visitId
            ? `/sill/${visitId}/reply`
            : "/shoebox",
      };
    }
    const message = (json as { error?: { message?: unknown } } | null)?.error
      ?.message;
    return {
      ok: false,
      message: typeof message === "string" && message ? message : UNREACHABLE,
    };
  } catch {
    return { ok: false, message: UNREACHABLE };
  }
}
