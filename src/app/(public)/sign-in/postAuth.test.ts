import { describe, expect, it } from "vitest";
import { postAuth } from "./postAuth";

type Call = { url: string; init: RequestInit };

function fakeFetch(status: number, body: unknown) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

describe("postAuth", () => {
  it("sends the number only in the JSON body and returns next", async () => {
    const { calls, fetchImpl } = fakeFetch(200, { next: "/sign-in/verify" });
    const result = await postAuth(
      "/api/auth/code",
      { phone: "+14155550123" },
      fetchImpl,
    );
    expect(result).toEqual({ ok: true, next: "/sign-in/verify" });
    expect(calls).toHaveLength(1);
    const [{ url, init }] = calls;
    expect(url).toBe("/api/auth/code");
    expect(url).not.toMatch(/\d{4}/);
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("content-type")).toBe(
      "application/json",
    );
    expect(JSON.parse(init.body as string)).toEqual({ phone: "+14155550123" });
    expect(JSON.stringify(init.headers)).not.toContain("4155550123");
  });

  it("passes the API's error message through", async () => {
    const { fetchImpl } = fakeFetch(400, {
      error: {
        code: "invalid",
        message: "That doesn't look like a phone number.",
      },
    });
    expect(
      await postAuth("/api/auth/code", { phone: "+1999" }, fetchImpl),
    ).toEqual({ ok: false, message: "That doesn't look like a phone number." });
  });

  it("falls back to a plain message when the API cannot be reached", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("offline");
    }) as typeof fetch;
    const result = await postAuth("/api/auth/code", { phone: "+1" }, fetchImpl);
    expect(result).toEqual({ ok: false, message: expect.any(String) });
  });

  it("falls back when an error body has no message", async () => {
    const { fetchImpl } = fakeFetch(500, "nope");
    const result = await postAuth("/api/auth/code", { phone: "+1" }, fetchImpl);
    expect(result.ok).toBe(false);
  });
});
