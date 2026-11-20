export type AuthResult =
  { ok: true; next: string } | { ok: false; message: string };

const UNREACHABLE = "We could not reach the loft. Try again.";

export async function postAuth(
  path: "/api/auth/code" | "/api/auth/verify",
  body: { phone: string } | { code: string },
  fetchImpl: typeof fetch = fetch,
): Promise<AuthResult> {
  try {
    const res = await fetchImpl(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json: unknown = await res.json().catch(() => null);
    if (res.ok) {
      const next = (json as { next?: unknown } | null)?.next;
      return typeof next === "string"
        ? { ok: true, next }
        : { ok: false, message: UNREACHABLE };
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
