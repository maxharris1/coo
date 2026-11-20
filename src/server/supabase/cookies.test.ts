import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestJar, toJarOptions } from "./cookies";

beforeEach(() => {
  vi.stubGlobal("fetch", () => {
    throw new Error("tests must not call the network");
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("toJarOptions", () => {
  it("keeps the options a jar understands", () => {
    expect(
      toJarOptions({
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: 400,
        domain: "example.com",
      }),
    ).toEqual({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 400,
    });
  });

  it.each([
    [true, "strict"],
    ["strict", "strict"],
    ["none", "none"],
    ["lax", "lax"],
  ] as const)("normalizes sameSite %s to %s", (sameSite, expected) => {
    expect(toJarOptions({ sameSite }).sameSite).toBe(expected);
  });

  it("omits sameSite when it is false or unset", () => {
    expect(toJarOptions({ sameSite: false })).not.toHaveProperty("sameSite");
    expect(toJarOptions({})).toEqual({});
  });
});

describe("requestJar", () => {
  it("reads the request cookies", () => {
    const req = new NextRequest("https://app.test/", {
      headers: { cookie: "a=1; b=2" },
    });
    expect(requestJar(req).jar.getAll()).toEqual([
      { name: "a", value: "1" },
      { name: "b", value: "2" },
    ]);
  });

  it("updates the request and replays cookies and headers onto the response", () => {
    const req = new NextRequest("https://app.test/", {
      headers: { cookie: "sb-example-auth-token=old" },
    });
    const { jar, commit } = requestJar(req);
    jar.setAll(
      [
        {
          name: "sb-example-auth-token",
          value: "fresh",
          options: { httpOnly: true, secure: true, sameSite: "lax", path: "/" },
        },
      ],
      { "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0" },
    );

    expect(req.cookies.get("sb-example-auth-token")?.value).toBe("fresh");

    const res = commit(new NextResponse(null));
    const [setCookie] = res.headers.getSetCookie();
    expect(setCookie).toMatch(/^sb-example-auth-token=fresh/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Secure/i);
    expect(setCookie).toMatch(/SameSite=lax/i);
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
  });
});
