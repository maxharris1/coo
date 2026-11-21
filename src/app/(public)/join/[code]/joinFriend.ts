export type JoinResult = { ok: true } | { ok: false; message: string };

const UNREACHABLE = "We could not reach the loft. Try again.";

export async function joinFriend(
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<JoinResult> {
  try {
    const res = await fetchImpl("/api/friends/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code }),
    });
    if (res.ok) return { ok: true };
    const json: unknown = await res.json().catch(() => null);
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
